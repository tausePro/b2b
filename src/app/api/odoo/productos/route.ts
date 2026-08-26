import { NextResponse, NextRequest } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import {
  authenticate,
  getEtiquetasCliente,
  getProductos,
  getProductosByPricelist,
  getEtiquetasProducto,
  getOdooTemplateCostInfoFromVariants,
  read,
  type OdooTemplateCostInfo,
} from '@/lib/odoo/client';
import type { OdooProduct } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles, getAccessibleOdooPartnerIds } from '@/lib/auth/apiRouteGuards';
import { loadPricingContext, resolveProductPrice, type PricingContext } from '@/lib/pricing/margins';
import { getOdooCostAgeStatus, markupOnCost, type OdooCostAgeStatus } from '@/lib/pricing/cost-staleness';

/**
 * Roles que pueden ver costo, markup y antigüedad.
 *   - super_admin / direccion: panel admin global.
 *   - asesor: consume desde su vista comercial (Fase 2 agregará la pantalla).
 * Se excluyen comprador y aprobador (usuarios del cliente) y editor_contenido.
 */
const COST_VISIBLE_ROLES = new Set(['super_admin', 'direccion', 'asesor']);

const AUTHENTICATED_PRODUCT_ROLES = ['super_admin', 'direccion', 'asesor', 'comprador', 'aprobador'] as const;
const AUTHENTICATED_MAX_LIMIT = 500;
const PUBLIC_MAX_LIMIT = 50;

function normalizeLimit(rawValue: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(rawValue || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeOffset(rawValue: string | null) {
  const parsed = Number.parseInt(rawValue || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const config = await getServerOdooConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de Odoo no encontrada' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partner_id');
    const pricelistIdParam = searchParams.get('pricelist_id');
    const tagIds = searchParams.get('tag_ids');
    const categIds = searchParams.get('categ_ids');
    const search = searchParams.get('search')?.trim() || '';
    const includeTagNames = searchParams.get('include_tag_names') === 'true';
    const parsedPartnerId = partnerId ? parseInt(partnerId, 10) : null;
    const parsedPricelistId = pricelistIdParam ? parseInt(pricelistIdParam, 10) : null;
    const parsedCategIds = (categIds || '')
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter(Boolean);
    const publicCatalogRequest =
      !parsedPartnerId &&
      !parsedPricelistId &&
      !tagIds &&
      parsedCategIds.length === 0 &&
      !includeTagNames &&
      search.length >= 3;

    if (partnerId && (!parsedPartnerId || Number.isNaN(parsedPartnerId))) {
      return NextResponse.json(
        { error: 'partner_id inválido' },
        { status: 400 }
      );
    }

    let actorRole: string | null = null;

    if (!publicCatalogRequest) {
      const authorized = await authorizeApiRoles(AUTHENTICATED_PRODUCT_ROLES);
      if (authorized instanceof NextResponse) {
        return authorized;
      }

      actorRole = authorized.actor.rol;
      const typedRole = authorized.actor.rol as (typeof AUTHENTICATED_PRODUCT_ROLES)[number];

      if (!parsedPartnerId && (typedRole === 'comprador' || typedRole === 'aprobador')) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            details: 'Debes consultar el catálogo con el partner asociado a tu empresa.',
          },
          { status: 403 }
        );
      }

      if (parsedPartnerId) {
        const accessiblePartnerIds = await getAccessibleOdooPartnerIds(authorized);
        if (!accessiblePartnerIds.has(parsedPartnerId)) {
          return NextResponse.json(
            {
              error: 'FORBIDDEN',
              details: 'No tienes acceso al partner Odoo solicitado.',
            },
            { status: 403 }
          );
        }
      }
    }

    const canSeeCost = actorRole !== null && COST_VISIBLE_ROLES.has(actorRole);

    const limit = normalizeLimit(
      searchParams.get('limit'),
      publicCatalogRequest ? PUBLIC_MAX_LIMIT : 200,
      publicCatalogRequest ? PUBLIC_MAX_LIMIT : AUTHENTICATED_MAX_LIMIT
    );
    const offset = publicCatalogRequest ? 0 : normalizeOffset(searchParams.get('offset'));

    const session = await authenticate(config);

    let productos: OdooProduct[] = [];
    let pricingCtx: PricingContext | null = null;
    let partnerContext: {
      id: number;
      name: string;
      tag_ids: number[];
      partner_tags: Array<{ id: number; name: string; color: number }>;
      pricelist: { id: number; name: string } | null;
    } | null = null;

    if (parsedPartnerId) {
      const [partnerRows, etiquetasCliente] = await Promise.all([
        read(
          'res.partner',
          [parsedPartnerId],
          ['id', 'name', 'category_id', 'property_product_pricelist'],
          session
        ),
        getEtiquetasCliente(session),
      ]);

      const partner = partnerRows[0];
      if (partner) {
        const partnerTagIds = Array.isArray(partner.category_id) ? (partner.category_id as number[]) : [];
        const pricelistValue = Array.isArray(partner.property_product_pricelist)
          ? (partner.property_product_pricelist as [number, string])
          : false;
        const etiquetasClienteMap = new Map(etiquetasCliente.map((tag) => [tag.id, tag]));

        partnerContext = {
          id: typeof partner.id === 'number' ? partner.id : parsedPartnerId,
          name: typeof partner.name === 'string' ? partner.name : `Partner ${parsedPartnerId}`,
          tag_ids: partnerTagIds,
          partner_tags: partnerTagIds.map((tagId) => {
            const tag = etiquetasClienteMap.get(tagId);
            return {
              id: tagId,
              name: tag?.name || `Etiqueta ${tagId}`,
              color: tag?.color || 0,
            };
          }),
          pricelist: pricelistValue
            ? {
                id: pricelistValue[0],
                name: pricelistValue[1],
              }
            : null,
        };
      }
    }

    if (parsedPartnerId) {
      const supaAdmin = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: empresaRow } = await supaAdmin
        .from('empresas')
        .select('id')
        .eq('odoo_partner_id', parsedPartnerId)
        .maybeSingle();

      if (empresaRow?.id) {
        pricingCtx = await loadPricingContext(empresaRow.id);
      }
    }

    // La pricelist del partner define la lista de productos asignados al cliente en Odoo
    // (Nicolás crea una pricelist por cliente; si no negoció precios, deja la columna en cero).
    // Por eso la pricelist filtra el catálogo SIEMPRE, sin importar el modo de pricing.
    // El modo solo decide cómo se calcula el precio mostrado en el portal:
    //   - 'pricelist'    -> usa el precio de la regla aplicada (resolveProductPrice fallback list_price).
    //   - 'costo_margen' -> resolveProductPrice ignora list_price y aplica standard_price * (1 + margen%).
    const effectivePricelistId =
      parsedPricelistId ?? partnerContext?.pricelist?.id ?? null;

    if (parsedPartnerId) {
      // Prioridad: 1) Lista de precios (override o Odoo), 2) Etiquetas del partner, 3) Catálogo general
      if (effectivePricelistId) {
        productos = await getProductosByPricelist(session, effectivePricelistId, {
          limit,
          offset,
          categIds: parsedCategIds,
          search,
        });
      }

      if (productos.length === 0) {
        const partnerTagIds = partnerContext?.tag_ids ?? [];
        if (partnerTagIds.length > 0) {
          productos = await getProductos(session, {
            tagIds: partnerTagIds,
            limit,
            offset,
            categIds: parsedCategIds,
            search,
          });
        }
      }

      if (productos.length === 0) {
        productos = await getProductos(session, {
          limit,
          offset,
          categIds: parsedCategIds,
          search,
        });
      }
    } else if (parsedPricelistId) {
      productos = await getProductosByPricelist(session, parsedPricelistId, {
        limit,
        offset,
        categIds: parsedCategIds,
        search,
      });
    } else if (tagIds) {
      const ids = tagIds.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
      productos = await getProductos(session, { tagIds: ids, categIds: parsedCategIds, limit, offset, search });
    } else {
      productos = await getProductos(session, { categIds: parsedCategIds, limit, offset, search });
    }

    // Orden importante:
    //   1) primero pedimos el costo y la antigüedad que Odoo expone por variante.
    //   2) recién luego aplicamos pricing, para que el modo 'costo+margen'
    //      use el standard_price autoritativo y el markup mostrado sea
    //      coherente con el modal de variantes.
    //
    // Si el rol no puede ver el costo (comprador/aprobador/editor_contenido),
    // saltamos el paso 1 para no gastar requests a Odoo: el pricing seguirá
    // usando standard_price del template (no se expone al cliente).
    //
    // El enrich está acotado por MAX_ENRICH_TEMPLATES (100) dentro de
    // getOdooTemplateCostInfoFromVariants. Si la página tiene más templates,
    // esos caen al standard_price del template como fallback.
    let costInfoByTemplate: Map<number, OdooTemplateCostInfo> | null = null;
    if (canSeeCost && productos.length > 0) {
      try {
        costInfoByTemplate = await getOdooTemplateCostInfoFromVariants(
          session,
          productos.map((p) => p.id)
        );
      } catch (variantErr) {
        console.warn('[API /odoo/productos] No se pudo enriquecer con variantes:', variantErr);
      }
    }

    // Aplicar pricing (override > costo+margen > pricelist) si hay partner_id.
    // Pasamos costInfoByTemplate para que costo_margen use el costo real de
    // la última compra en lugar del standard_price (AVCO/FIFO) del template.
    if (pricingCtx && productos.length > 0) {
      productos = applyPricing(productos, pricingCtx, costInfoByTemplate);
    }

    const productosTransformados = productos.map((producto) =>
      transformProductForRole(producto, canSeeCost, costInfoByTemplate?.get(producto.id))
    );

    if (includeTagNames) {
      const etiquetas = await getEtiquetasProducto(session);
      const etiquetasMap = new Map(etiquetas.map((tag) => [tag.id, tag.name]));
      const productosConEtiquetas = productosTransformados.map((producto) => ({
        ...producto,
        product_tags: (producto.product_tag_ids || []).map((tagId) => [tagId, etiquetasMap.get(tagId) || `Etiqueta ${tagId}`]),
      }));

      return NextResponse.json({
        productos: productosConEtiquetas,
        total: productosConEtiquetas.length,
        partner_context: partnerContext,
        etiquetas_producto: etiquetas,
      });
    }

    return NextResponse.json({ productos: productosTransformados, total: productosTransformados.length, partner_context: partnerContext });
  } catch (err) {
    console.error('[API /odoo/productos]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

/**
 * Aplica el pricing al catálogo. Si recibimos `costInfoByTemplate`, sustituimos
 * el `standard_price` vacío de templates multivariante por el costo de la
 * variante con compra valorada más reciente, solo para calcular la tarjeta.
 *
 * En productos de una variante, el costo y el markup corresponden directamente
 * a los campos de Odoo. En multivariantes, la UI remite al desglose por variante
 * y no presenta el valor representativo de la tarjeta como un costo único.
 */
function applyPricing(
  productos: OdooProduct[],
  ctx: PricingContext,
  costInfoByTemplate: Map<number, OdooTemplateCostInfo> | null
): OdooProduct[] {
  return productos.map((producto) => {
    const info = costInfoByTemplate?.get(producto.id);
    const productoForPricing = info
      ? { ...producto, standard_price: info.costo_efectivo }
      : producto;
    return {
      ...producto,
      list_price: resolveProductPrice(ctx, productoForPricing),
    };
  });
}

type EnrichedProduct = OdooProduct & {
  dias_desde_actualizacion?: number | null;
  antiguedad_costo_label?: string | null;
  antiguedad_costo_estado?: OdooCostAgeStatus;
  costo_desactualizado?: boolean | null;
  costo_requiere_variantes?: boolean;
  markup_porcentaje?: number | null;
  /** True si las variantes de este producto tienen costos muy distintos (alguna desactualizada). */
  variantes_divergentes?: boolean;
  /** Cuántas variantes activas con costo > 0 se consideraron al calcular costo_efectivo. */
  variantes_consideradas?: number;
};

/**
 * Transforma un producto antes de enviarlo al cliente según el rol del actor:
 *
 *   - Si `canSeeCost` es true (super_admin, dirección, asesor): el producto
 *     conserva standard_price y se enriquece con los campos autoritativos de
 *     última compra, markup y semáforo de Odoo.
 *     Si tiene múltiples variantes, la respuesta exige consultar el desglose
 *     y evita presentar una antigüedad agregada inexistente en Odoo.
 *   - Si es false (comprador, aprobador, editor_contenido, público):
 *     se eliminan todos los campos sensibles de costo y compra.
 */
function transformProductForRole(
  producto: OdooProduct,
  canSeeCost: boolean,
  variantInfo?: OdooTemplateCostInfo
): EnrichedProduct {
  if (canSeeCost) {
    // Si tenemos info real de variantes, la preferimos sobre los datos del template.
    const costoEfectivo = variantInfo?.costo_efectivo ?? producto.standard_price;
    const requiereVariantes = variantInfo?.requiere_desglose_variantes
      ?? Number(producto.product_variant_count ?? 1) > 1;
    const fechaEfectiva = requiereVariantes
      ? null
      : variantInfo?.fecha_costo_efectivo
        ?? (typeof producto.last_purchase_date === 'string' ? producto.last_purchase_date : null);
    const diasEfectivos = requiereVariantes
      ? null
      : variantInfo?.dias_costo_efectivo
        ?? (fechaEfectiva && typeof producto.last_purchase_days === 'number' ? producto.last_purchase_days : null);
    const labelEfectivo = requiereVariantes
      ? null
      : variantInfo?.label_costo_efectivo
        ?? (typeof producto.last_purchase_days_label === 'string' ? producto.last_purchase_days_label : null);
    const estadoAntiguedad = getOdooCostAgeStatus(fechaEfectiva, diasEfectivos);

    return {
      ...producto,
      standard_price: costoEfectivo,
      last_purchase_date: fechaEfectiva ?? false,
      last_purchase_days: diasEfectivos ?? 0,
      last_purchase_days_label: labelEfectivo ?? false,
      dias_desde_actualizacion: diasEfectivos,
      antiguedad_costo_label: labelEfectivo,
      antiguedad_costo_estado: estadoAntiguedad,
      costo_desactualizado: estadoAntiguedad === 'danger',
      costo_requiere_variantes: requiereVariantes,
      markup_porcentaje: requiereVariantes ? null : markupOnCost(producto.list_price, costoEfectivo),
      variantes_divergentes: variantInfo?.variantes_divergentes ?? false,
      variantes_consideradas: variantInfo?.variantes_consideradas ?? 0,
    };
  }

  // Eliminar campos sensibles para roles que no deben ver el costo.
  const rest = { ...producto } as Partial<OdooProduct>;
  delete rest.standard_price;
  delete rest.write_date;
  delete rest.last_purchase_date;
  delete rest.last_purchase_days;
  delete rest.last_purchase_days_label;
  return rest as OdooProduct;
}
