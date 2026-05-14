import { NextRequest, NextResponse } from 'next/server';
import {
  authenticate,
  getProductVariants,
  read,
  getLastPurchaseCostByVariants,
  type LastPurchaseCost,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { loadPricingContext, resolveProductPrice, type PricingContext } from '@/lib/pricing/margins';
import { getCostStaleness, markupOnCost } from '@/lib/pricing/cost-staleness';
import { loadStorefrontPricingContextById } from '@/lib/empaques/catalogo';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor', 'comprador', 'aprobador'] as const;

/**
 * Roles que pueden ver costo, antigüedad y markup en el modal de variantes.
 * Comprador y aprobador (usuarios del cliente) solo ven precio.
 */
const COST_VISIBLE_ROLES = new Set(['super_admin', 'direccion', 'asesor']);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authorized = await authorizeApiRoles(ALLOWED_ROLES);
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const { id } = await context.params;
    const templateId = parseInt(id, 10);
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return NextResponse.json(
        { error: 'template_id inválido' },
        { status: 400 }
      );
    }

    const config = await getServerOdooConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de Odoo no encontrada' },
        { status: 500 }
      );
    }

    const session = await authenticate(config);
    const result = await getProductVariants(session, templateId);

    const fallbackPriceParam = Number(request.nextUrl.searchParams.get('fallback_price') ?? 0);
    const fallbackPrice = Number.isFinite(fallbackPriceParam) && fallbackPriceParam > 0 ? fallbackPriceParam : 0;

    // Resolución de pricing.
    //
    // El admin abre el modal sin tener un `empresa_id` propio. Para que el
    // precio sea correcto necesitamos saber el contexto (empresa o storefront)
    // desde el que se invocó. Se acepta como query param y tiene prioridad
    // sobre `actor.empresa_id`:
    //
    //   1. ?empresa_id=<uuid>     → loadPricingContext (catálogo cliente).
    //   2. ?storefront_id=<uuid>  → loadStorefrontPricingContextById (empaques).
    //   3. fallback               → actor.empresa_id (usuario comprador / aprobador).
    const queryEmpresaId = request.nextUrl.searchParams.get('empresa_id');
    const queryStorefrontId = request.nextUrl.searchParams.get('storefront_id');

    let pricingCtx: PricingContext | null = null;
    if (queryEmpresaId) {
      pricingCtx = await loadPricingContext(queryEmpresaId);
    } else if (queryStorefrontId) {
      pricingCtx = await loadStorefrontPricingContextById(queryStorefrontId);
    } else if (authorized.actor.empresa_id) {
      pricingCtx = await loadPricingContext(authorized.actor.empresa_id);
    }

    // Datos del template (categoría / precio de lista) para alimentar
    // resolveProductPrice. Solo consultamos si vamos a usar pricingCtx.
    let templateCategId: number | null = null;
    let templateListPrice = 0;
    if (pricingCtx) {
      const templateRows = await read(
        'product.template',
        [templateId],
        ['categ_id', 'list_price'],
        session
      );
      templateCategId = templateRows[0] && Array.isArray(templateRows[0].categ_id)
        ? (templateRows[0].categ_id as [number, string])[0]
        : null;
      templateListPrice = Number(templateRows[0]?.list_price ?? 0);
    }

    const canSeeCost = COST_VISIBLE_ROLES.has(authorized.actor.rol);

    // Cargar costo "real" desde la última compra (factura o orden). Solo si el
    // rol puede ver costo — no hacer esta query para compradores.
    let lastPurchaseByVariant: Map<number, LastPurchaseCost> = new Map();
    if (canSeeCost && result.variants.length > 0) {
      try {
        lastPurchaseByVariant = await getLastPurchaseCostByVariants(
          session,
          result.variants.map((v) => v.id)
        );
      } catch (purchaseErr) {
        console.warn(
          '[API /odoo/productos/[id]/variantes] No se pudo cargar costo de última compra:',
          purchaseErr
        );
      }
    }

    return NextResponse.json({
      template_id: templateId,
      variant_count: result.variants.length,
      attributes: result.attributes,
      // Indica al cliente si esta respuesta incluye info de costo. La UI usa
      // este flag para decidir qué columnas mostrar en el modal.
      can_see_cost: canSeeCost,
      variants: result.variants.map((v) => {
        // Precio base por variante:
        //   1. Override manual del template (si el operador lo configuró) >
        //      se aplica vía resolveProductPrice abajo.
        //   2. lst_price propio de la variante (Odoo permite precio distinto
        //      por variante). Si > 0 lo usamos como base.
        //   3. list_price del template.
        //   4. fallback_price que pasó el caller (precio ya efectivo en la card).
        const variantOwnPrice = Number(v.lst_price ?? 0);
        let finalPrice = variantOwnPrice > 0
          ? variantOwnPrice
          : (templateListPrice > 0 ? templateListPrice : fallbackPrice);

        // Si hay pricingCtx, resolveProductPrice aplica override → margen sobre
        // costo → pricelist → fallback. Importante: pasamos el `standard_price`
        // DE LA VARIANTE (no del template). Eso hace que dos variantes con
        // costos distintos den precios distintos cuando el modo es costo+margen.
        if (pricingCtx) {
          finalPrice = resolveProductPrice(pricingCtx, {
            id: templateId,
            list_price: finalPrice,
            standard_price: v.standard_price,
            categ_id: templateCategId !== null ? [templateCategId, ''] : false,
          });
        }

        // Última red de seguridad: si todo lo anterior dio 0 pero el caller
        // pasó un fallback_price, usarlo. Mejor mostrar el precio "del template"
        // que mostrar $0 en una variante que sí se vende.
        if (finalPrice <= 0 && fallbackPrice > 0) {
          finalPrice = fallbackPrice;
        }

        const base: {
          id: number;
          name: string;
          default_code: string | null;
          image_128: string | null;
          lst_price: number;
          attribute_value_ids: number[];
          // Costo "efectivo" mostrado al usuario. Prioriza última compra real,
          // cae a standard_price si no hay historial.
          costo?: number;
          costo_source?: 'invoice' | 'order' | 'standard_price' | null;
          costo_fecha?: string | null;
          costo_proveedor?: string | null;
          costo_documento?: string | null;
          costo_moneda?: string | null;
          // standard_price del producto en Odoo (AVCO/FIFO) — info auxiliar
          // por si quieren comparar.
          standard_price?: number;
          // Antigüedad y staleness referidos al costo efectivo (fecha de
          // última compra si la hay; fallback write_date).
          dias_desde_actualizacion?: number | null;
          costo_desactualizado?: boolean | null;
          markup_porcentaje?: number | null;
        } = {
          id: v.id,
          name: v.name,
          default_code: v.default_code || null,
          image_128: v.image_128 || null,
          lst_price: finalPrice,
          attribute_value_ids: v.product_template_attribute_value_ids || [],
        };

        if (canSeeCost) {
          const lastPurchase = lastPurchaseByVariant.get(v.id) ?? null;
          base.standard_price = v.standard_price;

          if (lastPurchase) {
            // Costo real de la última compra (factura u orden).
            const staleness = getCostStaleness(lastPurchase.date);
            base.costo = lastPurchase.price_unit;
            base.costo_source = lastPurchase.source;
            base.costo_fecha = lastPurchase.date;
            base.costo_proveedor = lastPurchase.partner_name;
            base.costo_documento = lastPurchase.document_ref;
            base.costo_moneda = lastPurchase.currency;
            base.dias_desde_actualizacion = staleness.dias;
            base.costo_desactualizado = staleness.desactualizado;
            base.markup_porcentaje = markupOnCost(finalPrice, lastPurchase.price_unit);
          } else {
            // Fallback: no hay compras en el lookback. Usamos standard_price
            // y write_date como antes, pero marcamos la fuente.
            const writeDate = typeof v.write_date === 'string' ? v.write_date : null;
            const staleness = getCostStaleness(writeDate);
            base.costo = v.standard_price;
            base.costo_source = 'standard_price';
            base.costo_fecha = writeDate;
            base.costo_proveedor = null;
            base.costo_documento = null;
            base.costo_moneda = null;
            base.dias_desde_actualizacion = staleness.dias;
            base.costo_desactualizado = staleness.desactualizado;
            base.markup_porcentaje = markupOnCost(finalPrice, v.standard_price);
          }
        }

        return base;
      }),
    });
  } catch (err) {
    console.error('[API /odoo/productos/[id]/variantes]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
