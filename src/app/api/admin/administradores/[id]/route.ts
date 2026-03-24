import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const INTERNAL_ROLES = new Set(['super_admin', 'asesor', 'direccion', 'editor_contenido'] as const);

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireSuperAdmin(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string) {
  const { data, error } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (error || !data || data.rol !== 'super_admin' || !data.activo) return null;
  return data;
}

// PATCH — Editar usuario interno (rol, nombre, apellido, activo, reset password)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await context.params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const actor = await requireSuperAdmin(admin, user.id);
    if (!actor) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    // Verificar que el usuario objetivo existe y es interno
    const { data: target, error: targetError } = await admin
      .from('usuarios')
      .select('id, auth_id, rol, email, activo')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json(
        { error: 'Usuario no encontrado.', details: targetError?.message ?? null },
        { status: 404 }
      );
    }

    if (!INTERNAL_ROLES.has(target.rol as 'super_admin' | 'asesor' | 'direccion')) {
      return NextResponse.json(
        { error: 'Este endpoint solo gestiona usuarios internos Imprima.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Campos editables
    if (typeof body.nombre === 'string' && body.nombre.trim()) {
      updates.nombre = body.nombre.trim();
    }
    if (typeof body.apellido === 'string' && body.apellido.trim()) {
      updates.apellido = body.apellido.trim();
    }
    if (typeof body.rol === 'string' && INTERNAL_ROLES.has(body.rol)) {
      // No permitir que un super_admin se quite el rol a sí mismo
      if (target.id === actor.id && body.rol !== 'super_admin') {
        return NextResponse.json(
          { error: 'No puedes cambiar tu propio rol de super_admin.' },
          { status: 400 }
        );
      }
      updates.rol = body.rol;
    }
    if (typeof body.activo === 'boolean') {
      // No permitir desactivarse a sí mismo
      if (target.id === actor.id && !body.activo) {
        return NextResponse.json(
          { error: 'No puedes desactivar tu propia cuenta.' },
          { status: 400 }
        );
      }
      updates.activo = body.activo;
    }

    // Reset password
    if (typeof body.new_password === 'string' && body.new_password.length > 0) {
      if (body.new_password.length < 8) {
        return NextResponse.json(
          { error: 'La nueva contraseña debe tener al menos 8 caracteres.' },
          { status: 400 }
        );
      }

      if (target.auth_id) {
        const { error: pwError } = await admin.auth.admin.updateUserById(target.auth_id, {
          password: body.new_password,
        });

        if (pwError) {
          return NextResponse.json(
            { error: 'No se pudo actualizar la contraseña.', details: pwError.message },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'El usuario no tiene credenciales de acceso. Usa la activación de acceso.' },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updates).length === 0 && !body.new_password) {
      return NextResponse.json(
        { error: 'No se proporcionaron campos para actualizar.' },
        { status: 400 }
      );
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await admin
        .from('usuarios')
        .update(updates)
        .eq('id', targetUserId);

      if (updateError) {
        return NextResponse.json(
          { error: 'Error actualizando el usuario.', details: updateError.message },
          { status: 500 }
        );
      }
    }

    // Re-fetch updated user
    const { data: updated } = await admin
      .from('usuarios')
      .select('id, auth_id, odoo_user_id, email, nombre, apellido, rol, empresa_id, activo, created_at, updated_at')
      .eq('id', targetUserId)
      .single();

    return NextResponse.json({ usuario: updated });
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
