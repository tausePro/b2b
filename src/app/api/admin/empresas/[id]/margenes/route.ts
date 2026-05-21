import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeApiRoles,
  getAccessibleEmpresaIds,
  type AuthorizedApiContext,
} from '@/lib/auth/apiRouteGuards';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor'] as const;

/**
 * Garantiza que el actor autenticado tenga permiso sobre la empresa.
 *
 * super_admin y direccion ven todas las empresas.
 * asesor sólo ve las que están en `asesor_empresas` (filtro que ya hace
 * `getAccessibleEmpresaIds`).
 *
 * Devuelve `null` si está autorizado, o un NextResponse 403 listo para
 * devolver si no lo está.
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

// GET — Listar márgenes de una empresa
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
    .from('margenes_venta')
    .select('id, empresa_id, odoo_categ_id, margen_porcentaje, actualizado_por_id, created_at, updated_at')
    .eq('empresa_id', empresaId)
    .order('odoo_categ_id', { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ margenes: data ?? [] });
}

// POST — Crear o actualizar un margen (upsert por empresa + categoría)
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

  // Cambio de modo_pricing: prerrogativa de super_admin/direccion.
  // El asesor edita márgenes pero NO cambia el modelo de pricing global
  // del cliente. Eso queda bloqueado explícitamente acá.
  if (typeof body._set_modo_pricing === 'string') {
    if (auth.actor.rol === 'asesor') {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details:
            'El cambio de modo de pricing (pricelist vs costo+margen) está reservado a dirección o super admin.',
        },
        { status: 403 }
      );
    }
    const modo = body._set_modo_pricing === 'pricelist' ? 'pricelist' : 'costo_margen';
    const { error: upsertError } = await auth.admin
      .from('empresa_configs')
      .upsert(
        { empresa_id: empresaId, modo_pricing: modo },
        { onConflict: 'empresa_id' }
      );
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, modo_pricing: modo });
  }

  const odoo_categ_id = body.odoo_categ_id === null || body.odoo_categ_id === undefined
    ? null
    : Number(body.odoo_categ_id);

  const margen_porcentaje = Number(body.margen_porcentaje);
  if (!Number.isFinite(margen_porcentaje) || margen_porcentaje < 0 || margen_porcentaje > 999) {
    return NextResponse.json(
      { error: 'margen_porcentaje debe ser un número entre 0 y 999.' },
      { status: 400 }
    );
  }

  const { data, error } = await auth.admin
    .from('margenes_venta')
    .upsert(
      {
        empresa_id: empresaId,
        odoo_categ_id: odoo_categ_id,
        margen_porcentaje: margen_porcentaje,
        actualizado_por_id: auth.actor.id,
      },
      { onConflict: 'empresa_id,odoo_categ_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ margen: data });
}

// DELETE — Eliminar un margen específico
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
  const margenId = searchParams.get('margen_id');

  if (!margenId) {
    return NextResponse.json({ error: 'margen_id es requerido.' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('margenes_venta')
    .delete()
    .eq('id', margenId)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
