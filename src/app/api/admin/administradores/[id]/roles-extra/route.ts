/**
 * Gestión de roles extra (multi-rol por composición) para un usuario.
 *
 * - GET:  lista los roles extra activos del usuario.
 * - PUT:  reemplaza la lista completa de roles extra del usuario por la
 *         enviada. Marca activo=true los que están en la lista y
 *         activo=false los que ya existían pero no están.
 *
 * Solo super_admin puede gestionar roles extra. El UI puede ofrecer
 * checkboxes; el servidor aplica el diff de forma atómica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

// Roles válidos del sistema. Cualquier rol del enum puede asignarse como
// extra, pero solo super_admin puede operar este endpoint, así que no
// limitamos la lista (la responsabilidad de elegir bien es del actor).
const VALID_ROLES: ReadonlySet<UserRole> = new Set([
  'super_admin',
  'comprador',
  'aprobador',
  'asesor',
  'direccion',
  'editor_contenido',
]);

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireSuperAdmin(
  admin: ReturnType<typeof getSupabaseAdmin>,
  authUserId: string
) {
  const { data, error } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', authUserId)
    .maybeSingle();
  if (error || !data || data.rol !== 'super_admin' || !data.activo) return null;
  return data as { id: string; rol: string; activo: boolean };
}

async function loadTarget(
  admin: ReturnType<typeof getSupabaseAdmin>,
  targetUserId: string
) {
  const { data, error } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('id', targetUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; rol: string; activo: boolean };
}

// ---------- GET ----------
export async function GET(
  _request: NextRequest,
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

    const target = await loadTarget(admin, targetUserId);
    if (!target) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('usuario_roles_extra')
      .select('id, rol, activo, asignado_por, created_at, updated_at')
      .eq('usuario_id', targetUserId)
      .order('rol', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'No se pudieron cargar los roles extra.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      roles_extra: data ?? [],
      // Lista solo de roles activos como conveniencia para el UI.
      roles_extra_activos: (data ?? []).filter((r) => r.activo).map((r) => r.rol),
    });
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

// ---------- PUT ----------
// Body: { roles: string[] }  → lista de roles extra que el usuario debe
// tener activos después de la operación. El servidor:
//   1. Inserta o reactiva los roles enviados que no existían/estaban inactivos.
//   2. Desactiva (activo=false) los roles que existían activos pero no están
//      en la lista enviada (no los borra para preservar histórico).
export async function PUT(
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

    const target = await loadTarget(admin, targetUserId);
    if (!target) {
      return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    }

    const body = (await request.json()) as { roles?: unknown };
    if (!Array.isArray(body.roles)) {
      return NextResponse.json(
        { error: 'El campo `roles` debe ser un arreglo de strings.' },
        { status: 400 }
      );
    }

    // Validar roles: deduplicar, descartar inválidos y descartar el rol
    // primario del usuario (no tiene sentido tenerlo también como extra).
    const desired = new Set<UserRole>();
    for (const candidate of body.roles) {
      if (typeof candidate !== 'string') continue;
      if (!VALID_ROLES.has(candidate as UserRole)) continue;
      if (candidate === target.rol) continue;
      desired.add(candidate as UserRole);
    }

    // Estado actual.
    const { data: currentRows, error: currentError } = await admin
      .from('usuario_roles_extra')
      .select('id, rol, activo')
      .eq('usuario_id', targetUserId);

    if (currentError) {
      return NextResponse.json(
        { error: 'No se pudo leer el estado actual.', details: currentError.message },
        { status: 500 }
      );
    }

    const current = (currentRows ?? []) as { id: string; rol: string; activo: boolean }[];
    const currentByRol = new Map<string, { id: string; activo: boolean }>();
    for (const row of current) {
      currentByRol.set(row.rol, { id: row.id, activo: row.activo });
    }

    const now = new Date().toISOString();

    // 1. Insertar/reactivar los roles deseados.
    for (const rol of desired) {
      const existing = currentByRol.get(rol);
      if (existing) {
        if (!existing.activo) {
          const { error } = await admin
            .from('usuario_roles_extra')
            .update({ activo: true, asignado_por: actor.id, updated_at: now })
            .eq('id', existing.id);
          if (error) {
            return NextResponse.json(
              { error: 'Error reactivando rol extra.', details: error.message },
              { status: 500 }
            );
          }
        }
      } else {
        const { error } = await admin.from('usuario_roles_extra').insert({
          usuario_id: targetUserId,
          rol,
          activo: true,
          asignado_por: actor.id,
        });
        if (error) {
          return NextResponse.json(
            { error: 'Error asignando rol extra.', details: error.message },
            { status: 500 }
          );
        }
      }
    }

    // 2. Desactivar (soft delete) los roles que existían activos pero no
    //    están en la lista deseada.
    for (const row of current) {
      if (row.activo && !desired.has(row.rol as UserRole)) {
        const { error } = await admin
          .from('usuario_roles_extra')
          .update({ activo: false, updated_at: now })
          .eq('id', row.id);
        if (error) {
          return NextResponse.json(
            { error: 'Error revocando rol extra.', details: error.message },
            { status: 500 }
          );
        }
      }
    }

    // 3. Devolver estado final.
    const { data: finalRows } = await admin
      .from('usuario_roles_extra')
      .select('id, rol, activo, asignado_por, created_at, updated_at')
      .eq('usuario_id', targetUserId)
      .order('rol', { ascending: true });

    return NextResponse.json({
      roles_extra: finalRows ?? [],
      roles_extra_activos: (finalRows ?? []).filter((r) => r.activo).map((r) => r.rol),
    });
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
