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
    .from('storefront_margenes_venta')
    .select('id, storefront_config_id, odoo_categ_id, margen_porcentaje, created_at, updated_at')
    .eq('storefront_config_id', resolved.storefrontId)
    .order('odoo_categ_id', { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ margenes: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontId(slug);
  if (resolved instanceof NextResponse) return resolved;

  const body = await request.json();
  const odooCategId = body.odoo_categ_id === null || body.odoo_categ_id === undefined || body.odoo_categ_id === ''
    ? null
    : Number(body.odoo_categ_id);
  const margenPorcentaje = Number(body.margen_porcentaje);

  if (odooCategId !== null && (!Number.isFinite(odooCategId) || odooCategId <= 0)) {
    return NextResponse.json({ error: 'odoo_categ_id debe ser un número positivo o null.' }, { status: 400 });
  }

  if (!Number.isFinite(margenPorcentaje) || margenPorcentaje < 0 || margenPorcentaje > 999) {
    return NextResponse.json({ error: 'margen_porcentaje debe estar entre 0 y 999.' }, { status: 400 });
  }

  if (odooCategId === null) {
    const { data: existingDefault, error: existingError } = await resolved.auth.admin
      .from('storefront_margenes_venta')
      .select('id')
      .eq('storefront_config_id', resolved.storefrontId)
      .is('odoo_categ_id', null)
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    if (existingDefault?.id) {
      const { data, error } = await resolved.auth.admin
        .from('storefront_margenes_venta')
        .update({
          margen_porcentaje: margenPorcentaje,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDefault.id)
        .eq('storefront_config_id', resolved.storefrontId)
        .select('id, storefront_config_id, odoo_categ_id, margen_porcentaje, created_at, updated_at')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ margen: data });
    }

    const { data, error } = await resolved.auth.admin
      .from('storefront_margenes_venta')
      .insert({
        storefront_config_id: resolved.storefrontId,
        odoo_categ_id: null,
        margen_porcentaje: margenPorcentaje,
        updated_at: new Date().toISOString(),
      })
      .select('id, storefront_config_id, odoo_categ_id, margen_porcentaje, created_at, updated_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ margen: data });
  }

  const { data, error } = await resolved.auth.admin
    .from('storefront_margenes_venta')
    .upsert(
      {
        storefront_config_id: resolved.storefrontId,
        odoo_categ_id: odooCategId,
        margen_porcentaje: margenPorcentaje,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'storefront_config_id,odoo_categ_id' }
    )
    .select('id, storefront_config_id, odoo_categ_id, margen_porcentaje, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ margen: data });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontId(slug);
  if (resolved instanceof NextResponse) return resolved;

  const { searchParams } = new URL(request.url);
  const margenId = searchParams.get('margen_id');

  if (!margenId) {
    return NextResponse.json({ error: 'margen_id es requerido.' }, { status: 400 });
  }

  const { error } = await resolved.auth.admin
    .from('storefront_margenes_venta')
    .delete()
    .eq('id', margenId)
    .eq('storefront_config_id', resolved.storefrontId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
