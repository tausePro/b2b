import { NextResponse, NextRequest } from 'next/server';
import { testConnectionWithConfig, configFromParams } from '@/lib/odoo/client';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type StoredOdooConfigRecord = {
  id: string;
  odoo_url: string | null;
  odoo_db: string | null;
  odoo_username: string | null;
  odoo_password: string | null;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// POST: Test con credenciales enviadas directamente (para probar antes de guardar)
export async function POST(request: NextRequest) {
  try {
    const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { data: storedConfig } = await supabase
      .from('odoo_configs')
      .select('id, odoo_url, odoo_db, odoo_username, odoo_password')
      .is('empresa_id', null)
      .maybeSingle<StoredOdooConfigRecord>();

    const odoo_url = normalizeString(body.odoo_url) || storedConfig?.odoo_url || '';
    const odoo_db = normalizeString(body.odoo_db) || storedConfig?.odoo_db || '';
    const odoo_username = normalizeString(body.odoo_username) || storedConfig?.odoo_username || '';
    const odoo_password = typeof body.odoo_password === 'string' && body.odoo_password.length > 0
      ? body.odoo_password
      : storedConfig?.odoo_password || '';

    if (!odoo_url || !odoo_db || !odoo_username || !odoo_password) {
      return NextResponse.json(
        { success: false, error: 'Todos los campos son requeridos' },
        { status: 400 }
      );
    }

    const cfg = configFromParams({
      url: odoo_url,
      db: odoo_db,
      username: odoo_username,
      password: odoo_password,
    });

    const result = await testConnectionWithConfig(cfg);

    // Si el test fue exitoso, actualizar estado en BD
    if (result.success && storedConfig) {
      try {
        await supabase
          .from('odoo_configs')
          .update({
            ultimo_test_exitoso: true,
            ultimo_test_fecha: new Date().toISOString(),
            ultimo_test_mensaje: `Conectado. UID: ${result.uid}. Partners: ${result.partners_count}, Productos: ${result.products_count}, Pedidos: ${result.sale_orders_count}`,
          })
          .is('empresa_id', null);
      } catch {
        // No fallar si no se puede actualizar el estado
      }
    }

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

// GET: Test usando config guardada en BD
export async function GET() {
  try {
    const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('odoo_configs')
      .select('*')
      .is('empresa_id', null)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'No hay configuración de Odoo guardada. Configura las credenciales primero.' },
        { status: 404 }
      );
    }

    const cfg = configFromParams({
      url: data.odoo_url,
      db: data.odoo_db,
      username: data.odoo_username,
      password: data.odoo_password,
    });

    const result = await testConnectionWithConfig(cfg);

    // Actualizar estado del test en BD
    await supabase
      .from('odoo_configs')
      .update({
        ultimo_test_exitoso: result.success,
        ultimo_test_fecha: new Date().toISOString(),
        ultimo_test_mensaje: result.success
          ? `Conectado. UID: ${result.uid}. Partners: ${result.partners_count}, Productos: ${result.products_count}, Pedidos: ${result.sale_orders_count}`
          : result.error || 'Error desconocido',
      })
      .eq('id', data.id);

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
