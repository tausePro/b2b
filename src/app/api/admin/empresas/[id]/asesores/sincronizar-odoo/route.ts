import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncOdooAsesor } from '@/lib/odoo/syncOdooAsesor';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: empresaId } = await context.params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          details: authError?.message ?? null,
        },
        { status: 401 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: actorProfile, error: actorProfileError } = await admin
      .from('usuarios')
      .select('id, rol, activo')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (actorProfileError || !actorProfile || actorProfile.rol !== 'super_admin' || !actorProfile.activo) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: actorProfileError?.message ?? null,
        },
        { status: 403 }
      );
    }

    const { data: empresa, error: empresaError } = await admin
      .from('empresas')
      .select('id, nombre, activa, odoo_comercial_id, odoo_comercial_nombre')
      .eq('id', empresaId)
      .maybeSingle();

    if (empresaError || !empresa) {
      return NextResponse.json(
        {
          error: 'La empresa indicada no existe.',
          details: empresaError?.message ?? null,
        },
        { status: 404 }
      );
    }

    if (!empresa.activa) {
      return NextResponse.json(
        {
          error: 'La empresa está inactiva y no admite sincronización de asesor.',
        },
        { status: 400 }
      );
    }

    if (!empresa.odoo_comercial_id && !empresa.odoo_comercial_nombre) {
      return NextResponse.json(
        {
          error: 'La empresa no tiene comercial Odoo asociado.',
        },
        { status: 400 }
      );
    }

    const result = await syncOdooAsesor({
      autoCreateIfMissing: true,
      comercialOdooId: empresa.odoo_comercial_id ? Number(empresa.odoo_comercial_id) : null,
      comercialOdooNombre: empresa.odoo_comercial_nombre || null,
      empresaId,
      supabaseAdmin: admin,
    });

    if (!result.asesor && result.mode !== 'assigned_existing' && result.mode !== 'linked_by_email' && result.mode !== 'linked_by_name' && result.mode !== 'created') {
      return NextResponse.json(
        {
          error: result.aviso || 'No se pudo sincronizar el asesor Odoo.',
          mode: result.mode,
          odoo_salesperson: result.odooSalesperson,
        },
        { status: result.mode === 'conflict_email' || result.mode === 'conflict_role' ? 409 : 400 }
      );
    }

    return NextResponse.json(
      {
        asesor: result.asesor,
        asesor_asignado_id: result.asesorAsignadoId,
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
        },
        mode: result.mode,
        odoo_salesperson: result.odooSalesperson,
        message:
          result.mode === 'created'
            ? 'Asesor local creado y asignado desde Odoo.'
            : result.mode === 'linked_by_email'
              ? 'Asesor local vinculado por email y asignado a la empresa.'
              : result.mode === 'linked_by_name'
                ? 'Asesor local vinculado por nombre y asignado a la empresa.'
                : 'Asesor local ya existente y asignado a la empresa.',
        warning: result.aviso,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
