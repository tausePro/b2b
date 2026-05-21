import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeApiRoles,
  getAccessibleEmpresaIds,
  type AuthorizedApiContext,
} from '@/lib/auth/apiRouteGuards';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor'] as const;

/**
 * Verifica que el actor pueda operar sobre la empresa solicitada.
 *
 * super_admin/direccion siempre pueden; asesor sólo si la empresa está en
 * `asesor_empresas`. La verificación se delega a `getAccessibleEmpresaIds`
 * que ya implementa esa lógica unificada.
 */
async function ensureEmpresaAccess(
  ctx: AuthorizedApiContext,
  empresaId: string
): Promise<NextResponse | null> {
  const empresas = await getAccessibleEmpresaIds(ctx);
  if (!empresas.includes(empresaId)) {
    return NextResponse.json(
      {
        error: 'FORBIDDEN',
        details: 'No tienes acceso a esta empresa.',
      },
      { status: 403 }
    );
  }
  return null;
}

// GET — Listar overrides de precio de una empresa
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApiRoles(ALLOWED_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id: empresaId } = await context.params;
  const forbidden = await ensureEmpresaAccess(auth, empresaId);
  if (forbidden) return forbidden;

  const { data, error } = await auth.admin
    .from('precios_empresa_producto')
    .select('id, empresa_id, odoo_product_id, precio_override, actualizado_por_id, created_at, updated_at')
    .eq('empresa_id', empresaId)
    .order('odoo_product_id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ precios: data ?? [] });
}

// POST — Crear o actualizar un override de precio (upsert)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApiRoles(ALLOWED_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id: empresaId } = await context.params;
  const forbidden = await ensureEmpresaAccess(auth, empresaId);
  if (forbidden) return forbidden;

  const body = await request.json();

  const odoo_product_id = Number(body.odoo_product_id);
  if (!Number.isFinite(odoo_product_id) || odoo_product_id <= 0) {
    return NextResponse.json(
      { error: 'odoo_product_id debe ser un número positivo.' },
      { status: 400 }
    );
  }

  const precio_override = Number(body.precio_override);
  if (!Number.isFinite(precio_override) || precio_override < 0) {
    return NextResponse.json(
      { error: 'precio_override debe ser un número >= 0.' },
      { status: 400 }
    );
  }

  const { data, error } = await auth.admin
    .from('precios_empresa_producto')
    .upsert(
      {
        empresa_id: empresaId,
        odoo_product_id,
        precio_override,
        actualizado_por_id: auth.actor.id,
      },
      { onConflict: 'empresa_id,odoo_product_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ precio: data });
}

// DELETE — Eliminar un override de precio
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApiRoles(ALLOWED_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id: empresaId } = await context.params;
  const forbidden = await ensureEmpresaAccess(auth, empresaId);
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const precioId = searchParams.get('precio_id');

  if (!precioId) {
    return NextResponse.json({ error: 'precio_id es requerido.' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('precios_empresa_producto')
    .delete()
    .eq('id', precioId)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
