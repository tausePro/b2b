import { NextRequest, NextResponse } from 'next/server';
import {
  authenticate,
  getProductVariants,
  read,
  resolvePricelistPrice,
  type PricelistRuleSet,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles, getAccessibleEmpresaIds } from '@/lib/auth/apiRouteGuards';
import { loadPricingContext, resolveProductPrice, type PricingContext } from '@/lib/pricing/margins';
import { loadEmpresaPricelistRules } from '@/lib/pricing/pricelist';
import { getOdooCostAgeStatus, markupOnCost } from '@/lib/pricing/cost-staleness';
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

    if (queryEmpresaId) {
      const accessibleEmpresaIds = await getAccessibleEmpresaIds(authorized);
      if (!accessibleEmpresaIds.includes(queryEmpresaId)) {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
      }
    }

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

    // En modo tarifa cada variante puede tener un precio negociado distinto.
    // Este endpoint no consultaba la tarifa, así que todas las variantes
    // heredaban el precio de la card y dos variantes con precios distintos se
    // cobraban igual.
    let pricelistRules: PricelistRuleSet | null = null;
    const empresaIdForPricelist = queryEmpresaId ?? authorized.actor.empresa_id;
    if (pricingCtx?.modoPricing === 'pricelist' && empresaIdForPricelist) {
      try {
        pricelistRules = await loadEmpresaPricelistRules(empresaIdForPricelist, session);
      } catch (pricelistErr) {
        console.warn(
          '[API /odoo/productos/[id]/variantes] No se pudo cargar la tarifa del cliente:',
          pricelistErr
        );
      }
    }

    const canSeeCost = COST_VISIBLE_ROLES.has(authorized.actor.rol);

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

        // Precio real de esta variante en la tarifa del cliente. Va antes de
        // resolveProductPrice para que un override manual siga ganando.
        if (pricelistRules) {
          const tarifaPrice = resolvePricelistPrice(pricelistRules, {
            templateId,
            variantId: v.id,
            categId: templateCategId,
            basePrice: finalPrice,
          });
          if (tarifaPrice !== null) {
            finalPrice = tarifaPrice;
          }
        }

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
          // Costo autoritativo mostrado por Odoo en la variante.
          // La fecha y los días provienen del módulo de última compra valorada.
          costo?: number;
          costo_source?: 'odoo' | null;
          costo_fecha?: string | null;
          // standard_price del producto en Odoo, según el método de costo
          // configurado en la categoría.
          standard_price?: number;
          // Antigüedad y semáforo autoritativos del módulo de Odoo,
          // basados en la última compra valorada.
          dias_desde_actualizacion?: number | null;
          antiguedad_costo_label?: string | null;
          antiguedad_costo_estado?: ReturnType<typeof getOdooCostAgeStatus>;
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
          const lastPurchaseDate = typeof v.last_purchase_date === 'string' ? v.last_purchase_date : null;
          const lastPurchaseDays = lastPurchaseDate && typeof v.last_purchase_days === 'number'
            ? v.last_purchase_days
            : null;
          const lastPurchaseLabel = typeof v.last_purchase_days_label === 'string'
            ? v.last_purchase_days_label
            : null;
          const costAgeStatus = getOdooCostAgeStatus(lastPurchaseDate, lastPurchaseDays);

          base.costo = v.standard_price;
          base.costo_source = 'odoo';
          base.costo_fecha = lastPurchaseDate;
          base.standard_price = v.standard_price;
          base.dias_desde_actualizacion = lastPurchaseDays;
          base.antiguedad_costo_label = lastPurchaseLabel;
          base.antiguedad_costo_estado = costAgeStatus;
          base.costo_desactualizado = costAgeStatus === 'danger';
          base.markup_porcentaje = markupOnCost(finalPrice, v.standard_price);
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
