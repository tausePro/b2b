import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getProductVariants, read } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { loadMarginsForEmpresa, getEffectiveMargin, calculateSellingPrice } from '@/lib/pricing/margins';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor', 'comprador', 'aprobador'] as const;

export async function GET(
  _request: NextRequest,
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

    // Resolver márgenes desde la empresa del usuario autenticado
    const empresaId = authorized.actor.empresa_id;
    let margin = 20; // default

    if (empresaId) {
      const margins = await loadMarginsForEmpresa(empresaId);

      // Obtener categ_id del template para resolver el margen por categoría
      const templateRows = await read(
        'product.template',
        [templateId],
        ['categ_id'],
        session
      );
      const categId = templateRows[0] && Array.isArray(templateRows[0].categ_id)
        ? (templateRows[0].categ_id as [number, string])[0]
        : null;

      margin = getEffectiveMargin(margins, categId);
    }

    return NextResponse.json({
      template_id: templateId,
      variant_count: result.variants.length,
      attributes: result.attributes,
      variants: result.variants.map((v) => {
        const sellingPrice = calculateSellingPrice(v.standard_price, margin);
        return {
          id: v.id,
          name: v.name,
          default_code: v.default_code || null,
          image_128: v.image_128 || null,
          lst_price: sellingPrice > 0 ? sellingPrice : v.lst_price,
          standard_price: v.standard_price,
          attribute_value_ids: v.product_template_attribute_value_ids,
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
