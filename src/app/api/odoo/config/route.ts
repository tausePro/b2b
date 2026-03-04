import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// GET: Obtener configuración Odoo global
export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from('odoo_configs')
      .select('*')
      .is('empresa_id', null)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data || null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

// POST: Guardar/actualizar configuración Odoo global
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { odoo_url, odoo_db, odoo_username, odoo_password, odoo_version } = body;

    if (!odoo_url || !odoo_db || !odoo_username || !odoo_password) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos: odoo_url, odoo_db, odoo_username, odoo_password' },
        { status: 400 }
      );
    }

    // Verificar si ya existe config global
    const { data: existing } = await supabase
      .from('odoo_configs')
      .select('id')
      .is('empresa_id', null)
      .single();

    let result;

    if (existing) {
      // Actualizar
      result = await supabase
        .from('odoo_configs')
        .update({
          odoo_url,
          odoo_db,
          odoo_username,
          odoo_password,
          odoo_version: odoo_version || '18.0',
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insertar
      result = await supabase
        .from('odoo_configs')
        .insert({
          empresa_id: null,
          odoo_url,
          odoo_db,
          odoo_username,
          odoo_password,
          odoo_version: odoo_version || '18.0',
        })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ config: result.data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
