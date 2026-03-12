import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const USER_SELECT = 'id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, activo, created_at';
const ALLOWED_CLIENT_ROLES = new Set(['comprador', 'aprobador'] as const);

type ClientRole = 'comprador' | 'aprobador';

interface CreateUserPayload {
  nombre?: string;
  apellido?: string;
  email?: string;
  password?: string;
  rol?: ClientRole;
  sede_id?: string | null;
}

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

    if (actorProfileError || !actorProfile || actorProfile.rol !== 'super_admin' || !actorProfile.activo) {
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
    const sedeId = body.sede_id ?? null;

    if (!nombre || !apellido || !email || !password || !rol) {
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

    if (password.length < 8) {
      return NextResponse.json(
        {
          error: 'La contraseña temporal debe tener al menos 8 caracteres.',
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

    if (rol === 'comprador' && empresa.usa_sedes && !sedeId) {
      return NextResponse.json(
        {
          error: 'Los compradores de esta empresa deben quedar asociados a una sede.',
        },
        { status: 400 }
      );
    }

    if (sedeId) {
      const { data: sede, error: sedeError } = await admin
        .from('sedes')
        .select('id, empresa_id')
        .eq('id', sedeId)
        .maybeSingle();

      if (sedeError || !sede || sede.empresa_id !== empresaId) {
        return NextResponse.json(
          {
            error: 'La sede seleccionada no pertenece a la empresa.',
            details: sedeError?.message ?? null,
          },
          { status: 400 }
        );
      }
    }

    const { data: existingProfile, error: existingProfileError } = await admin
      .from('usuarios')
      .select('id, email, empresa_id, rol')
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
      return NextResponse.json(
        {
          error: 'Ya existe un perfil de usuario con ese email en la plataforma.',
        },
        { status: 409 }
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
        sede_id: rol === 'comprador' ? sedeId : null,
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

    return NextResponse.json(
      {
        usuario: createdProfile,
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
        },
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
