import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdmin } from '@/lib/admin/auth';

async function getStorefrontId(slug: string) {
  const auth = await authorizeAdmin();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.admin
    .from('storefront_configs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.id) return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });

  return { auth, storefrontId: String(data.id) };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontId(slug);
  if (resolved instanceof NextResponse) return resolved;

  const { data, error } = await resolved.auth.admin
    .from('storefront_precios_producto')
    .select('id, storefront_config_id, odoo_product_id, precio_override, created_at, updated_at')
    .eq('storefront_config_id', resolved.storefrontId)
    .order('odoo_product_id', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ precios: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontId(slug);
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

  const { data, error } = await resolved.auth.admin
    .from('storefront_precios_producto')
    .upsert(
      {
        storefront_config_id: resolved.storefrontId,
        odoo_product_id: Math.trunc(odooProductId),
        precio_override: precioOverride,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'storefront_config_id,odoo_product_id' }
    )
    .select('id, storefront_config_id, odoo_product_id, precio_override, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ precio: data });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontId(slug);
  if (resolved instanceof NextResponse) return resolved;

  const { searchParams } = new URL(request.url);
  const precioId = searchParams.get('precio_id');

  if (!precioId) {
    return NextResponse.json({ error: 'precio_id es requerido.' }, { status: 400 });
  }

  const { error } = await resolved.auth.admin
    .from('storefront_precios_producto')
    .delete()
    .eq('id', precioId)
    .eq('storefront_config_id', resolved.storefrontId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
