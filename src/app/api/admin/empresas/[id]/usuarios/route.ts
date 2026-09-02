import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const USER_SELECT = 'id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, activo, created_at';
const ALLOWED_CLIENT_ROLES = new Set(['comprador', 'aprobador'] as const);
const ALLOWED_ACTOR_ROLES = new Set(['super_admin', 'direccion'] as const);

type ClientRole = 'comprador' | 'aprobador';

interface CreateUserPayload {
  nombre?: string;
  apellido?: string;
  email?: string;
  password?: string;
  rol?: ClientRole;
  sede_ids?: string[];
  sede_id?: string | null;
}

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: empresaId } = await context.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: actor } = await admin
      .from('usuarios')
      .select('rol, activo')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (!actor?.activo || !actor.rol || !ALLOWED_ACTOR_ROLES.has(actor.rol as 'super_admin' | 'direccion')) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const { data: memberships, error: membershipError } = await admin
      .from('usuario_empresas')
      .select('id, rol, activo, es_principal, usuario:usuarios!usuario_empresas_usuario_id_fkey(id, auth_id, email, nombre, apellido, activo, created_at)')
      .eq('empresa_id', empresaId)
      .order('created_at');
    if (membershipError) throw membershipError;

    const membershipIds = (memberships ?? []).map((membership) => String(membership.id));
    const { data: siteRows, error: sitesError } = membershipIds.length > 0
      ? await admin
          .from('usuario_empresa_sedes')
          .select('usuario_empresa_id, sede_id, activa, es_predeterminada')
          .in('usuario_empresa_id', membershipIds)
          .eq('activa', true)
          .order('es_predeterminada', { ascending: false })
          .order('created_at')
      : { data: [], error: null };
    if (sitesError) throw sitesError;

    const sitesByMembership = new Map<string, Array<{ sede_id: string; es_predeterminada: boolean }>>();
    for (const row of siteRows ?? []) {
      const key = String(row.usuario_empresa_id);
      const current = sitesByMembership.get(key) ?? [];
      current.push({ sede_id: String(row.sede_id), es_predeterminada: row.es_predeterminada === true });
      sitesByMembership.set(key, current);
    }

    const usuarios = (memberships ?? []).flatMap((membership) => {
      const rawUser = Array.isArray(membership.usuario) ? membership.usuario[0] : membership.usuario;
      if (!rawUser) return [];
      const sites = sitesByMembership.get(String(membership.id)) ?? [];
      return [{
        ...rawUser,
        rol: membership.rol,
        activo: membership.activo === true && rawUser.activo === true,
        asociacion_id: membership.id,
        es_principal: membership.es_principal === true,
        sede_ids: sites.map((site) => site.sede_id),
        sede_id: sites.find((site) => site.es_predeterminada)?.sede_id ?? (sites.length === 1 ? sites[0].sede_id : null),
      }];
    });

    return NextResponse.json({ usuarios });
  } catch (error) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
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

    if (
      actorProfileError ||
      !actorProfile ||
      !actorProfile.activo ||
      !actorProfile.rol ||
      !ALLOWED_ACTOR_ROLES.has(actorProfile.rol as 'super_admin' | 'direccion')
    ) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: actorProfileError?.message ?? null,
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateUserPayload;
    const nombre = body.nombre?.trim();
    const apellido = body.apellido?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    const rol = body.rol;
    const sedeIds = Array.from(new Set(
      (Array.isArray(body.sede_ids) ? body.sede_ids : body.sede_id ? [body.sede_id] : [])
        .map((id) => id.trim())
        .filter(Boolean)
    ));

    if (!nombre || !apellido || !email || !rol) {
      return NextResponse.json(
        {
          error: 'Faltan datos obligatorios para crear el usuario.',
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_CLIENT_ROLES.has(rol)) {
      return NextResponse.json(
        {
          error: 'El rol seleccionado no está permitido para usuarios cliente.',
        },
        { status: 400 }
      );
    }

    const { data: empresa, error: empresaError } = await admin
      .from('empresas')
      .select('id, nombre, usa_sedes, activa')
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
          error: 'La empresa está inactiva y no admite nuevas altas.',
        },
        { status: 400 }
      );
    }

    if (empresa.usa_sedes && sedeIds.length === 0) {
      return NextResponse.json(
        {
          error: 'El usuario debe quedar asociado al menos a una sede de esta empresa.',
        },
        { status: 400 }
      );
    }

    if (sedeIds.length > 0) {
      const { data: validSites, error: sitesError } = await admin
        .from('sedes')
        .select('id')
        .in('id', sedeIds)
        .eq('empresa_id', empresaId)
        .eq('activa', true);

      if (sitesError || (validSites ?? []).length !== sedeIds.length) {
        return NextResponse.json(
          {
            error: 'Una o más sedes seleccionadas no pertenecen a la empresa.',
            details: sitesError?.message ?? null,
          },
          { status: 400 }
        );
      }
    }

    const { data: existingProfile, error: existingProfileError } = await admin
      .from('usuarios')
      .select(USER_SELECT)
      .ilike('email', email)
      .maybeSingle();

    if (existingProfileError) {
      return NextResponse.json(
        {
          error: 'No se pudo validar si el email ya existe.',
          details: existingProfileError.message,
        },
        { status: 500 }
      );
    }

    if (existingProfile) {
      if (!ALLOWED_CLIENT_ROLES.has(existingProfile.rol as ClientRole)) {
        return NextResponse.json(
          { error: 'El correo pertenece a un usuario interno y no puede asociarse como cliente.' },
          { status: 409 }
        );
      }

      if (!existingProfile.activo) {
        if (password.length < 8) {
          return NextResponse.json(
            { error: 'El usuario está inactivo. Indica una contraseña temporal de al menos 8 caracteres para reactivarlo.' },
            { status: 400 }
          );
        }
        if (existingProfile.auth_id) {
          const { error: authUpdateError } = await admin.auth.admin.updateUserById(existingProfile.auth_id, {
            password,
            email_confirm: true,
          });
          if (authUpdateError) {
            return NextResponse.json(
              { error: 'No se pudo reactivar el acceso del usuario.', details: authUpdateError.message },
              { status: 400 }
            );
          }
        } else {
          const { data: authCreation, error: authCreationError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (authCreationError || !authCreation.user) {
            return NextResponse.json(
              { error: 'No se pudo crear el acceso de autenticación.', details: authCreationError?.message ?? null },
              { status: 400 }
            );
          }
          await admin.from('usuarios').update({ auth_id: authCreation.user.id }).eq('id', existingProfile.id);
        }
      }

      const { count: activeMemberships, error: countError } = await admin
        .from('usuario_empresas')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', existingProfile.id)
        .eq('activo', true);
      if (countError) throw countError;

      const { data: membershipId, error: membershipError } = await admin.rpc('configurar_usuario_empresa', {
        p_usuario_id: existingProfile.id,
        p_empresa_id: empresaId,
        p_rol: rol,
        p_sede_ids: sedeIds,
        p_es_principal: (activeMemberships ?? 0) === 0,
        p_creado_por: actorProfile.id,
      });
      if (membershipError) {
        return NextResponse.json(
          { error: 'No se pudo asociar el usuario a la empresa.', details: membershipError.message },
          { status: 500 }
        );
      }

      await admin.from('usuarios').update({ activo: true }).eq('id', existingProfile.id);
      return NextResponse.json({
        usuario: {
          ...existingProfile,
          rol,
          activo: true,
          asociacion_id: membershipId,
          sede_ids: sedeIds,
          sede_id: sedeIds[0] ?? null,
        },
        empresa: { id: empresa.id, nombre: empresa.nombre },
        associated: true,
      });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña temporal debe tener al menos 8 caracteres para un usuario nuevo.' },
        { status: 400 }
      );
    }

    const { data: authCreation, error: authCreationError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        apellido,
        rol,
        empresa_id: empresaId,
      },
    });

    if (authCreationError || !authCreation.user) {
      return NextResponse.json(
        {
          error: authCreationError?.message ?? 'No se pudo crear el usuario en autenticación.',
        },
        { status: 400 }
      );
    }

    const { data: createdProfile, error: profileError } = await admin
      .from('usuarios')
      .insert({
        auth_id: authCreation.user.id,
        email,
        nombre,
        apellido,
        rol,
        empresa_id: empresaId,
        sede_id: rol === 'comprador' ? (sedeIds[0] ?? null) : null,
        activo: true,
      })
      .select(USER_SELECT)
      .single();

    if (profileError || !createdProfile) {
      await admin.auth.admin.deleteUser(authCreation.user.id);

      return NextResponse.json(
        {
          error: 'No se pudo crear el perfil del usuario.',
          details: profileError?.message ?? null,
        },
        { status: 500 }
      );
    }

    const { data: membershipId, error: membershipError } = await admin.rpc('configurar_usuario_empresa', {
      p_usuario_id: createdProfile.id,
      p_empresa_id: empresaId,
      p_rol: rol,
      p_sede_ids: sedeIds,
      p_es_principal: true,
      p_creado_por: actorProfile.id,
    });
    if (membershipError) {
      await admin.auth.admin.deleteUser(authCreation.user.id);
      return NextResponse.json(
        { error: 'No se pudo configurar el acceso del usuario.', details: membershipError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        usuario: {
          ...createdProfile,
          rol,
          asociacion_id: membershipId,
          sede_ids: sedeIds,
          sede_id: sedeIds[0] ?? null,
        },
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
        },
        associated: false,
      },
      { status: 201 }
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
