import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const USER_SELECT = 'id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, activo, created_at';
const ALLOWED_CLIENT_ROLES = new Set(['comprador', 'aprobador'] as const);
const ALLOWED_ACTOR_ROLES = new Set(['super_admin', 'direccion'] as const);

type ClientRole = 'comprador' | 'aprobador';

interface UpdateUserPayload {
  nombre?: string;
  apellido?: string;
  email?: string;
  rol?: ClientRole;
  sede_ids?: string[];
  sede_id?: string | null;
  activo?: boolean;
}

interface ResolvedContext {
  admin: SupabaseClient;
  empresaId: string;
  userId: string;
  empresa: { id: string; nombre: string; usa_sedes: boolean; activa: boolean };
  membership: { id: string; rol: ClientRole; activo: boolean; es_principal: boolean };
  targetUser: {
    id: string;
    auth_id: string | null;
    email: string;
    nombre: string;
    apellido: string;
    rol: string;
    empresa_id: string | null;
    sede_id: string | null;
    activo: boolean;
  };
}

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function authorizeAndResolve(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
): Promise<ResolvedContext | NextResponse> {
  void request;
  const { id: empresaId, userId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', details: authError?.message ?? null },
      { status: 401 }
    );
  }

  const admin = getSupabaseAdmin();

  const { data: actorProfile, error: actorProfileError } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (
    actorProfileError ||
    !actorProfile ||
    !actorProfile.activo ||
    !actorProfile.rol ||
    !ALLOWED_ACTOR_ROLES.has(actorProfile.rol as 'super_admin' | 'direccion')
  ) {
    return NextResponse.json(
      { error: 'FORBIDDEN', details: actorProfileError?.message ?? null },
      { status: 403 }
    );
  }

  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('id, nombre, usa_sedes, activa')
    .eq('id', empresaId)
    .maybeSingle();

  if (empresaError || !empresa) {
    return NextResponse.json(
      { error: 'La empresa indicada no existe.', details: empresaError?.message ?? null },
      { status: 404 }
    );
  }

  const { data: membership, error: membershipError } = await admin
    .from('usuario_empresas')
    .select('id, rol, activo, es_principal')
    .eq('usuario_id', userId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: 'El usuario no está asociado a la empresa indicada.', details: membershipError?.message ?? null },
      { status: 404 }
    );
  }

  const { data: targetUser, error: targetError } = await admin
    .from('usuarios')
    .select(USER_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (targetError || !targetUser) {
    return NextResponse.json(
      { error: 'El usuario indicado no existe.', details: targetError?.message ?? null },
      { status: 404 }
    );
  }

  return {
    admin,
    empresaId,
    userId,
    empresa: empresa as ResolvedContext['empresa'],
    membership: membership as ResolvedContext['membership'],
    targetUser: targetUser as ResolvedContext['targetUser'],
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const resolved = await authorizeAndResolve(request, context);
    if (resolved instanceof NextResponse) return resolved;

    const { admin, empresaId, userId, empresa, membership, targetUser } = resolved;
    const body = (await request.json()) as UpdateUserPayload;

    const updates: Record<string, unknown> = {};
    let nextRole = membership.rol;

    if (body.nombre !== undefined) {
      const nombre = body.nombre?.trim();
      if (!nombre) {
        return NextResponse.json(
          { error: 'El nombre no puede quedar vacío.' },
          { status: 400 }
        );
      }
      updates.nombre = nombre;
    }

    if (body.apellido !== undefined) {
      const apellido = body.apellido?.trim();
      if (!apellido) {
        return NextResponse.json(
          { error: 'El apellido no puede quedar vacío.' },
          { status: 400 }
        );
      }
      updates.apellido = apellido;
    }

    if (body.rol !== undefined) {
      if (!ALLOWED_CLIENT_ROLES.has(body.rol)) {
        return NextResponse.json(
          { error: 'El rol seleccionado no está permitido para usuarios cliente.' },
          { status: 400 }
        );
      }
      nextRole = body.rol;
    }

    const { data: currentSiteRows, error: currentSitesError } = await admin
      .from('usuario_empresa_sedes')
      .select('sede_id')
      .eq('usuario_empresa_id', membership.id)
      .eq('activa', true);
    if (currentSitesError) throw currentSitesError;

    const requestedSiteIds = Array.from(new Set(
      (Array.isArray(body.sede_ids)
        ? body.sede_ids
        : body.sede_id !== undefined
          ? body.sede_id ? [body.sede_id] : []
          : (currentSiteRows ?? []).map((row) => String(row.sede_id)))
        .map((id) => id.trim())
        .filter(Boolean)
    ));

    if (empresa.usa_sedes && requestedSiteIds.length === 0) {
      return NextResponse.json(
        { error: 'El usuario debe conservar al menos una sede autorizada.' },
        { status: 400 }
      );
    }

    if (requestedSiteIds.length > 0) {
      const { data: validSites, error: sitesError } = await admin
        .from('sedes')
        .select('id')
        .in('id', requestedSiteIds)
        .eq('empresa_id', empresaId)
        .eq('activa', true);
      if (sitesError || (validSites ?? []).length !== requestedSiteIds.length) {
        return NextResponse.json(
          { error: 'Una o más sedes seleccionadas no pertenecen a la empresa.', details: sitesError?.message ?? null },
          { status: 400 }
        );
      }
    }

    const membershipActive = body.activo ?? membership.activo;

    let nextEmail: string | null = null;
    if (body.email !== undefined) {
      const email = body.email?.trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { error: 'El email no puede quedar vacío.' },
          { status: 400 }
        );
      }
      if (email !== targetUser.email.toLowerCase()) {
        const { data: collision, error: collisionError } = await admin
          .from('usuarios')
          .select('id')
          .ilike('email', email)
          .neq('id', userId)
          .maybeSingle();
        if (collisionError) {
          return NextResponse.json(
            {
              error: 'No se pudo validar si el email ya existe.',
              details: collisionError.message,
            },
            { status: 500 }
          );
        }
        if (collision) {
          return NextResponse.json(
            { error: 'Ya existe otro perfil con ese email.' },
            { status: 409 }
          );
        }
        updates.email = email;
        nextEmail = email;
      }
    }

    const hasMembershipChanges = body.rol !== undefined
      || body.sede_ids !== undefined
      || body.sede_id !== undefined
      || body.activo !== undefined;
    if (Object.keys(updates).length === 0 && !hasMembershipChanges) {
      return NextResponse.json(
        { error: 'No se enviaron cambios para aplicar.' },
        { status: 400 }
      );
    }

    if (nextEmail && targetUser.auth_id) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(
        targetUser.auth_id,
        { email: nextEmail }
      );
      if (authUpdateError) {
        return NextResponse.json(
          {
            error: 'No se pudo actualizar el email en autenticación.',
            details: authUpdateError.message,
          },
          { status: 400 }
        );
      }
    }

    if (membershipActive) {
      const { error: membershipError } = await admin.rpc('configurar_usuario_empresa', {
        p_usuario_id: userId,
        p_empresa_id: empresaId,
        p_rol: nextRole,
        p_sede_ids: requestedSiteIds,
        p_es_principal: membership.es_principal,
        p_creado_por: null,
      });
      if (membershipError) {
        return NextResponse.json(
          { error: 'No se pudo actualizar el acceso a la empresa.', details: membershipError.message },
          { status: 500 }
        );
      }
      updates.activo = true;
      if (membership.es_principal) {
        updates.rol = nextRole;
        updates.sede_id = nextRole === 'comprador' ? (requestedSiteIds[0] ?? null) : null;
      }
    } else {
      const { error: membershipError } = await admin
        .from('usuario_empresas')
        .update({ activo: false, es_principal: false })
        .eq('id', membership.id);
      if (membershipError) throw membershipError;

      if (membership.es_principal) {
        const { data: replacement } = await admin
          .from('usuario_empresas')
          .select('id, empresa_id, rol')
          .eq('usuario_id', userId)
          .eq('activo', true)
          .order('created_at')
          .limit(1)
          .maybeSingle();
        if (replacement) {
          await admin.from('usuario_empresas').update({ es_principal: true }).eq('id', replacement.id);
          const { data: replacementSites } = await admin
            .from('usuario_empresa_sedes')
            .select('sede_id, es_predeterminada')
            .eq('usuario_empresa_id', replacement.id)
            .eq('activa', true);
          const sites = replacementSites ?? [];
          updates.empresa_id = replacement.empresa_id;
          updates.rol = replacement.rol;
          updates.sede_id = replacement.rol === 'comprador'
            ? sites.find((site) => site.es_predeterminada)?.sede_id ?? sites[0]?.sede_id ?? null
            : null;
        } else {
          updates.activo = false;
        }
      }
    }

    let updated = targetUser;
    if (Object.keys(updates).length > 0) {
      const { data: updatedProfile, error: updateError } = await admin
        .from('usuarios')
        .update(updates)
        .eq('id', userId)
        .select(USER_SELECT)
        .single();

      if (updateError || !updatedProfile) {
        return NextResponse.json(
          {
            error: 'No se pudo actualizar el perfil del usuario.',
            details: updateError?.message ?? null,
          },
          { status: 500 }
        );
      }
      updated = updatedProfile as ResolvedContext['targetUser'];
    }

    return NextResponse.json({
      usuario: {
        ...updated,
        rol: nextRole,
        activo: membershipActive && updated.activo,
        asociacion_id: membership.id,
        sede_ids: requestedSiteIds,
        sede_id: requestedSiteIds[0] ?? null,
      },
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const resolved = await authorizeAndResolve(request, context);
    if (resolved instanceof NextResponse) return resolved;

    const { admin, userId, targetUser, membership } = resolved;

    const { error: unlinkError } = await admin
      .from('usuario_empresas')
      .update({ activo: false, es_principal: false })
      .eq('id', membership.id);
    if (unlinkError) {
      return NextResponse.json(
        { error: 'No se pudo retirar el acceso a esta empresa.', details: unlinkError.message },
        { status: 500 }
      );
    }

    const { data: remainingMemberships, error: remainingError } = await admin
      .from('usuario_empresas')
      .select('id, empresa_id, rol, es_principal')
      .eq('usuario_id', userId)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('created_at');
    if (remainingError) throw remainingError;

    if ((remainingMemberships ?? []).length > 0) {
      if (membership.es_principal) {
        const replacement = remainingMemberships![0];
        await admin.from('usuario_empresas').update({ es_principal: true }).eq('id', replacement.id);
        const { data: replacementSites } = await admin
          .from('usuario_empresa_sedes')
          .select('sede_id, es_predeterminada')
          .eq('usuario_empresa_id', replacement.id)
          .eq('activa', true);
        const sites = replacementSites ?? [];
        await admin
          .from('usuarios')
          .update({
            empresa_id: replacement.empresa_id,
            rol: replacement.rol,
            sede_id: replacement.rol === 'comprador'
              ? sites.find((site) => site.es_predeterminada)?.sede_id ?? sites[0]?.sede_id ?? null
              : null,
          })
          .eq('id', userId);
      }

      return NextResponse.json({
        ok: true,
        association_removed: true,
        account_active: true,
        remaining_companies: remainingMemberships!.length,
      });
    }

    // 1) Soft delete: marcar inactivo (idempotente y no dependiente del estado de auth).
    const { error: deactivateError } = await admin
      .from('usuarios')
      .update({ activo: false })
      .eq('id', userId);

    if (deactivateError) {
      return NextResponse.json(
        {
          error: 'No se pudo desactivar al usuario.',
          details: deactivateError.message,
        },
        { status: 500 }
      );
    }

    let accessRevoked = false;
    let hardDeleted = false;
    let revokeWarning: string | null = null;

    if (targetUser.auth_id) {
      // 2) Invalidar acceso: rotar password a uno aleatorio para cortar sesiones y bloquear login.
      const randomPassword = randomBytes(24).toString('base64url');
      const { error: rotateError } = await admin.auth.admin.updateUserById(
        targetUser.auth_id,
        { password: randomPassword }
      );

      if (rotateError) {
        revokeWarning = `No se pudo rotar la contraseña: ${rotateError.message}`;
      } else {
        accessRevoked = true;
      }

      // 3) Intentar borrar la cuenta auth. Si tiene actividad asociada (pedidos, logs), el
      //    CASCADE sobre public.usuarios fallará y mantendremos el perfil como soft delete.
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUser.auth_id);
      if (!deleteAuthError) {
        hardDeleted = true;
      } else if (
        // Errores típicos de FK bloqueada en cascade. Conservamos soft delete.
        !/foreign key|violates|23503/i.test(deleteAuthError.message)
      ) {
        revokeWarning = revokeWarning
          ? `${revokeWarning}; ${deleteAuthError.message}`
          : deleteAuthError.message;
      }
    } else {
      accessRevoked = true; // Sin auth_id, ya no hay acceso posible.
    }

    return NextResponse.json({
      ok: true,
      hard_deleted: hardDeleted,
      access_revoked: accessRevoked,
      soft_deleted: !hardDeleted,
      warning: revokeWarning,
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
