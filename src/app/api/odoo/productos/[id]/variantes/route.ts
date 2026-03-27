import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getProductVariants } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';

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

    return NextResponse.json({
      template_id: templateId,
      variant_count: result.variants.length,
      attributes: result.attributes,
      variants: result.variants.map((v) => ({
        id: v.id,
        name: v.name,
        default_code: v.default_code || null,
        image_128: v.image_128 || null,
        lst_price: v.lst_price,
        attribute_value_ids: v.product_template_attribute_value_ids,
      })),
    });
  } catch (err) {
    console.error('[API /odoo/productos/[id]/variantes]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
