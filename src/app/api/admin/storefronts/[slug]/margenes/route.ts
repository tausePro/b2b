import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeApiRoles,
  getAccessibleStorefrontIds,
  type AuthorizedApiContext,
} from '@/lib/auth/apiRouteGuards';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor'] as const;

const SELECT_FIELDS =
  'id, storefront_config_id, odoo_categ_id, margen_porcentaje, actualizado_por_id, created_at, updated_at';

/**
 * Resuelve el storefront por slug y valida que el actor tenga permiso de
 * gestión sobre él. super_admin/direccion pueden con todos. asesor sólo si
 * está asignado en `asesor_storefronts` (vía `getAccessibleStorefrontIds`).
 */
async function resolveStorefrontForActor(
  ctx: AuthorizedApiContext,
  slug: string
): Promise<{ storefrontId: string } | NextResponse> {
  const { data, error } = await ctx.admin
    .from('storefront_configs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.id) return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });

  const storefrontId = String(data.id);
  const accessibles = await getAccessibleStorefrontIds(ctx);
  if (!accessibles.includes(storefrontId)) {
    return NextResponse.json(
      {
        error: 'FORBIDDEN',
        details: 'No tienes acceso a este storefront.',
      },
      { status: 403 }
    );
  }

  return { storefrontId };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(ALLOWED_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  const resolved = await resolveStorefrontForActor(auth, slug);
  if (resolved instanceof NextResponse) return resolved;

  const { data, error } = await auth.admin
    .from('storefront_margenes_venta')
    .select(SELECT_FIELDS)
    .eq('storefront_config_id', resolved.storefrontId)
    .order('odoo_categ_id', { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ margenes: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(ALLOWED_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  const resolved = await resolveStorefrontForActor(auth, slug);
  if (resolved instanceof NextResponse) return resolved;

  const body = await request.json();
  const odooCategId =
    body.odoo_categ_id === null || body.odoo_categ_id === undefined || body.odoo_categ_id === ''
      ? null
      : Number(body.odoo_categ_id);
  const margenPorcentaje = Number(body.margen_porcentaje);

  if (odooCategId !== null && (!Number.isFinite(odooCategId) || odooCategId <= 0)) {
    return NextResponse.json({ error: 'odoo_categ_id debe ser un número positivo o null.' }, { status: 400 });
  }

  if (!Number.isFinite(margenPorcentaje) || margenPorcentaje < 0 || margenPorcentaje > 999) {
    return NextResponse.json({ error: 'margen_porcentaje debe estar entre 0 y 999.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  if (odooCategId === null) {
    const { data: existingDefault, error: existingError } = await auth.admin
      .from('storefront_margenes_venta')
      .select('id')
      .eq('storefront_config_id', resolved.storefrontId)
      .is('odoo_categ_id', null)
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    if (existingDefault?.id) {
      const { data, error } = await auth.admin
        .from('storefront_margenes_venta')
        .update({
          margen_porcentaje: margenPorcentaje,
          actualizado_por_id: auth.actor.id,
          updated_at: nowIso,
        })
        .eq('id', existingDefault.id)
        .eq('storefront_config_id', resolved.storefrontId)
        .select(SELECT_FIELDS)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ margen: data });
    }

    const { data, error } = await auth.admin
      .from('storefront_margenes_venta')
      .insert({
        storefront_config_id: resolved.storefrontId,
        odoo_categ_id: null,
        margen_porcentaje: margenPorcentaje,
        actualizado_por_id: auth.actor.id,
        updated_at: nowIso,
      })
      .select(SELECT_FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ margen: data });
  }

  const { data, error } = await auth.admin
    .from('storefront_margenes_venta')
    .upsert(
      {
        storefront_config_id: resolved.storefrontId,
        odoo_categ_id: odooCategId,
        margen_porcentaje: margenPorcentaje,
        actualizado_por_id: auth.actor.id,
        updated_at: nowIso,
      },
      { onConflict: 'storefront_config_id,odoo_categ_id' }
    )
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ margen: data });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(ALLOWED_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  const resolved = await resolveStorefrontForActor(auth, slug);
  if (resolved instanceof NextResponse) return resolved;

  const { searchParams } = new URL(request.url);
  const margenId = searchParams.get('margen_id');

  if (!margenId) {
    return NextResponse.json({ error: 'margen_id es requerido.' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('storefront_margenes_venta')
    .delete()
    .eq('id', margenId)
    .eq('storefront_config_id', resolved.storefrontId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
