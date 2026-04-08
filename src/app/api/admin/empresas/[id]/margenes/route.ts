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

// GET — Listar márgenes de una empresa
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorize();
  if ('error' in auth && auth.error) return auth.error;
  const { admin } = auth as { admin: ReturnType<typeof getSupabaseAdmin>; perfil: { id: string } };

  const { id: empresaId } = await context.params;

  const { data, error } = await admin
    .from('margenes_venta')
    .select('id, empresa_id, odoo_categ_id, margen_porcentaje, created_at, updated_at')
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
  const auth = await authorize();
  if ('error' in auth && auth.error) return auth.error;
  const { admin } = auth as { admin: ReturnType<typeof getSupabaseAdmin>; perfil: { id: string } };

  const { id: empresaId } = await context.params;
  const body = await request.json();

  // Cambio de modo_pricing
  if (typeof body._set_modo_pricing === 'string') {
    const modo = body._set_modo_pricing === 'pricelist' ? 'pricelist' : 'costo_margen';
    const { error: upsertError } = await admin
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

  const { data, error } = await admin
    .from('margenes_venta')
    .upsert(
      {
        empresa_id: empresaId,
        odoo_categ_id: odoo_categ_id,
        margen_porcentaje: margen_porcentaje,
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
  const auth = await authorize();
  if ('error' in auth && auth.error) return auth.error;
  const { admin } = auth as { admin: ReturnType<typeof getSupabaseAdmin>; perfil: { id: string } };

  const { id: empresaId } = await context.params;
  const { searchParams } = new URL(request.url);
  const margenId = searchParams.get('margen_id');

  if (!margenId) {
    return NextResponse.json({ error: 'margen_id es requerido.' }, { status: 400 });
  }

  const { error } = await admin
    .from('margenes_venta')
    .delete()
    .eq('id', margenId)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
