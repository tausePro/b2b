import { NextResponse, NextRequest } from 'next/server';
import { testConnectionWithConfig, configFromParams } from '@/lib/odoo/client';
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

// POST: Test con credenciales enviadas directamente (para probar antes de guardar)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { odoo_url, odoo_db, odoo_username, odoo_password } = body;

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
    if (result.success) {
      try {
        const supabase = await getSupabaseServer();
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
    const supabase = await getSupabaseServer();

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
