import { NextResponse, NextRequest } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type StoredOdooConfigRecord = {
  id: string;
  odoo_url: string | null;
  odoo_db: string | null;
  odoo_username: string | null;
  odoo_password: string | null;
  odoo_version: string | null;
  ultimo_test_exitoso: boolean | null;
  ultimo_test_fecha: string | null;
  ultimo_test_mensaje: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeConfig(record: StoredOdooConfigRecord | null) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    odoo_url: record.odoo_url ?? '',
    odoo_db: record.odoo_db ?? '',
    odoo_username: record.odoo_username ?? '',
    odoo_version: record.odoo_version ?? '18.0',
    has_password: Boolean(record.odoo_password),
    ultimo_test_exitoso: record.ultimo_test_exitoso,
    ultimo_test_fecha: record.ultimo_test_fecha,
    ultimo_test_mensaje: record.ultimo_test_mensaje,
  };
}

// GET: Obtener configuración Odoo global
export async function GET() {
  try {
    const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('odoo_configs')
      .select('id, odoo_url, odoo_db, odoo_username, odoo_password, odoo_version, ultimo_test_exitoso, ultimo_test_fecha, ultimo_test_mensaje')
      .is('empresa_id', null)
      .maybeSingle<StoredOdooConfigRecord>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: sanitizeConfig(data ?? null) });
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
    const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { data: existing, error: existingError } = await supabase
      .from('odoo_configs')
      .select('id, odoo_url, odoo_db, odoo_username, odoo_password, odoo_version, ultimo_test_exitoso, ultimo_test_fecha, ultimo_test_mensaje')
      .is('empresa_id', null)
      .maybeSingle<StoredOdooConfigRecord>();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const odoo_url = normalizeString(body.odoo_url);
    const odoo_db = normalizeString(body.odoo_db);
    const odoo_username = normalizeString(body.odoo_username);
    const submittedPassword = typeof body.odoo_password === 'string' ? body.odoo_password : '';
    const odoo_version = normalizeString(body.odoo_version) || existing?.odoo_version || '18.0';
    const effectivePassword = submittedPassword || existing?.odoo_password || '';

    if (!odoo_url || !odoo_db || !odoo_username || !effectivePassword) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos: odoo_url, odoo_db, odoo_username, odoo_password' },
        { status: 400 }
      );
    }

    let result;

    if (existing) {
      result = await supabase
        .from('odoo_configs')
        .update({
          odoo_url,
          odoo_db,
          odoo_username,
          odoo_password: effectivePassword,
          odoo_version,
        })
        .eq('id', existing.id)
        .select('id, odoo_url, odoo_db, odoo_username, odoo_password, odoo_version, ultimo_test_exitoso, ultimo_test_fecha, ultimo_test_mensaje')
        .single();
    } else {
      result = await supabase
        .from('odoo_configs')
        .insert({
          empresa_id: null,
          odoo_url,
          odoo_db,
          odoo_username,
          odoo_password: effectivePassword,
          odoo_version,
        })
        .select('id, odoo_url, odoo_db, odoo_username, odoo_password, odoo_version, ultimo_test_exitoso, ultimo_test_fecha, ultimo_test_mensaje')
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ config: sanitizeConfig((result.data ?? null) as StoredOdooConfigRecord | null) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
