import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ALLOWED_ROLES = ['super_admin', 'direccion'];

async function authorize() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  }

  const admin = getSupabaseAdmin();
  const { data: perfil } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!perfil?.activo || !perfil.rol || !ALLOWED_ROLES.includes(perfil.rol)) {
    return { error: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
  }

  return { admin, perfil };
}

// GET — Listar overrides de precio de una empresa
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize();
  if ('error' in auth && auth.error) return auth.error;
  const { admin } = auth as { admin: ReturnType<typeof getSupabaseAdmin>; perfil: { id: string } };

  const { id: empresaId } = await context.params;

  const { data, error } = await admin
    .from('precios_empresa_producto')
    .select('id, empresa_id, odoo_product_id, precio_override, created_at, updated_at')
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
  const auth = await authorize();
  if ('error' in auth && auth.error) return auth.error;
  const { admin } = auth as { admin: ReturnType<typeof getSupabaseAdmin>; perfil: { id: string } };

  const { id: empresaId } = await context.params;
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

  const { data, error } = await admin
    .from('precios_empresa_producto')
    .upsert(
      {
        empresa_id: empresaId,
        odoo_product_id,
        precio_override,
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
  const auth = await authorize();
  if ('error' in auth && auth.error) return auth.error;
  const { admin } = auth as { admin: ReturnType<typeof getSupabaseAdmin>; perfil: { id: string } };

  const { id: empresaId } = await context.params;
  const { searchParams } = new URL(request.url);
  const precioId = searchParams.get('precio_id');

  if (!precioId) {
    return NextResponse.json({ error: 'precio_id es requerido.' }, { status: 400 });
  }

  const { error } = await admin
    .from('precios_empresa_producto')
    .delete()
    .eq('id', precioId)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
