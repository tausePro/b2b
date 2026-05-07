import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getProductVariants, read } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { loadPricingContext, resolveProductPrice } from '@/lib/pricing/margins';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor', 'comprador', 'aprobador'] as const;

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

    // Resolver pricing desde la empresa del usuario autenticado
    const empresaId = authorized.actor.empresa_id;
    let pricingCtx = null;
    let templateCategId: number | null = null;
    let templateListPrice = 0;
    let templateStandardPrice = 0;

    if (empresaId) {
      pricingCtx = await loadPricingContext(empresaId);

      const templateRows = await read(
        'product.template',
        [templateId],
        ['categ_id', 'list_price', 'standard_price'],
        session
      );
      templateCategId = templateRows[0] && Array.isArray(templateRows[0].categ_id)
        ? (templateRows[0].categ_id as [number, string])[0]
        : null;
      templateListPrice = Number(templateRows[0]?.list_price ?? 0);
      templateStandardPrice = Number(templateRows[0]?.standard_price ?? 0);
    }

    return NextResponse.json({
      template_id: templateId,
      variant_count: result.variants.length,
      attributes: result.attributes,
      variants: result.variants.map((v) => {
        let finalPrice = Number(v.lst_price ?? 0) > 0 ? v.lst_price : fallbackPrice || templateListPrice;
        const pricingStandardPrice = templateStandardPrice > 0 ? templateStandardPrice : v.standard_price;
        if (pricingCtx) {
          finalPrice = resolveProductPrice(pricingCtx, {
            id: templateId,
            list_price: finalPrice,
            standard_price: pricingStandardPrice,
            categ_id: templateCategId !== null ? [templateCategId, ''] : false,
          });
        }
        return {
          id: v.id,
          name: v.name,
          default_code: v.default_code || null,
          image_128: v.image_128 || null,
          lst_price: finalPrice,
          attribute_value_ids: v.product_template_attribute_value_ids || [],
        };
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
