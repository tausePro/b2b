import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeApiRoles,
  getAccessibleStorefrontIds,
  type AuthorizedApiContext,
} from '@/lib/auth/apiRouteGuards';

const ALLOWED_ROLES = ['super_admin', 'direccion', 'asesor'] as const;

const SELECT_FIELDS =
  'id, storefront_config_id, odoo_product_id, precio_override, actualizado_por_id, created_at, updated_at';

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
    .from('storefront_precios_producto')
    .select(SELECT_FIELDS)
    .eq('storefront_config_id', resolved.storefrontId)
    .order('odoo_product_id', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ precios: data ?? [] });
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
  const odooProductId = Number(body.odoo_product_id);
  const precioOverride = Number(body.precio_override);

  if (!Number.isFinite(odooProductId) || odooProductId <= 0) {
    return NextResponse.json({ error: 'odoo_product_id debe ser un número positivo.' }, { status: 400 });
  }

  if (!Number.isFinite(precioOverride) || precioOverride < 0) {
    return NextResponse.json({ error: 'precio_override debe ser mayor o igual a 0.' }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from('storefront_precios_producto')
    .upsert(
      {
        storefront_config_id: resolved.storefrontId,
        odoo_product_id: Math.trunc(odooProductId),
        precio_override: precioOverride,
        actualizado_por_id: auth.actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'storefront_config_id,odoo_product_id' }
    )
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ precio: data });
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
  const precioId = searchParams.get('precio_id');

  if (!precioId) {
    return NextResponse.json({ error: 'precio_id es requerido.' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('storefront_precios_producto')
    .delete()
    .eq('id', precioId)
    .eq('storefront_config_id', resolved.storefrontId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
