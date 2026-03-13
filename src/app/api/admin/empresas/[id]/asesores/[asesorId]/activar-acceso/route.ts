import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const USER_SELECT = 'id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, activo, created_at';

interface ActivateAsesorAccessPayload {
  password?: string;
}

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function findAuthUserByEmail(admin: ReturnType<typeof getSupabaseAdmin>, email: string) {
  let page = 1;
  const perPage = 200;
  const normalizedEmail = email.toLowerCase();

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      return { user: null, error };
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;

    if (match) {
      return { user: match, error: null };
    }

    if (!data.nextPage || data.users.length === 0 || (data.lastPage && page >= data.lastPage)) {
      return { user: null, error: null };
    }

    page = data.nextPage;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; asesorId: string }> }
) {
  try {
    const { id: empresaId, asesorId } = await context.params;
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

    const body = (await request.json()) as ActivateAsesorAccessPayload;
    const password = body.password ?? '';

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
      .select('id, nombre, activa')
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
          error: 'La empresa está inactiva y no admite activación de acceso.',
        },
        { status: 400 }
      );
    }

    const { data: asesor, error: asesorError } = await admin
      .from('usuarios')
      .select('id, auth_id, email, nombre, apellido, rol, activo')
      .eq('id', asesorId)
      .maybeSingle();

    if (asesorError || !asesor) {
      return NextResponse.json(
        {
          error: 'El asesor indicado no existe.',
          details: asesorError?.message ?? null,
        },
        { status: 404 }
      );
    }

    if (asesor.rol !== 'asesor') {
      return NextResponse.json(
        {
          error: 'El usuario indicado no es un asesor interno.',
        },
        { status: 400 }
      );
    }

    if (!asesor.activo) {
      return NextResponse.json(
        {
          error: 'El asesor está inactivo y no admite acceso al portal.',
        },
        { status: 400 }
      );
    }

    const email = typeof asesor.email === 'string' ? asesor.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json(
        {
          error: 'El asesor no tiene un email válido para activar acceso.',
        },
        { status: 400 }
      );
    }

    const { data: duplicatedProfiles, error: duplicatedProfilesError } = await admin
      .from('usuarios')
      .select('id')
      .neq('id', asesorId)
      .ilike('email', email);

    if (duplicatedProfilesError) {
      return NextResponse.json(
        {
          error: 'No se pudo validar si el email del asesor está duplicado.',
          details: duplicatedProfilesError.message,
        },
        { status: 500 }
      );
    }

    if ((duplicatedProfiles?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'Ya existe otro perfil con el mismo email. Corrige el email antes de activar acceso.',
        },
        { status: 409 }
      );
    }

    const userMetadata = {
      nombre: asesor.nombre,
      apellido: asesor.apellido,
      rol: 'asesor',
    };

    let authUserId = typeof asesor.auth_id === 'string' ? asesor.auth_id : null;
    let modo: 'creado' | 'actualizado' | 'enlazado' = 'actualizado';

    if (authUserId) {
      const { data: updatedAuth, error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (!updateAuthError && updatedAuth.user) {
        authUserId = updatedAuth.user.id;
        modo = 'actualizado';
      } else {
        authUserId = null;
      }
    }

    if (!authUserId) {
      const { user: existingAuthUser, error: existingAuthUserError } = await findAuthUserByEmail(admin, email);

      if (existingAuthUserError) {
        return NextResponse.json(
          {
            error: 'No se pudo validar si el asesor ya existe en autenticación.',
            details: existingAuthUserError.message,
          },
          { status: 500 }
        );
      }

      if (existingAuthUser) {
        const { data: relinkedAuth, error: relinkAuthError } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });

        if (relinkAuthError || !relinkedAuth.user) {
          return NextResponse.json(
            {
              error: relinkAuthError?.message ?? 'No se pudo actualizar el acceso del asesor.',
            },
            { status: 400 }
          );
        }

        authUserId = relinkedAuth.user.id;
        modo = 'enlazado';
      } else {
        const { data: createdAuth, error: createdAuthError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });

        if (createdAuthError || !createdAuth.user) {
          return NextResponse.json(
            {
              error: createdAuthError?.message ?? 'No se pudo crear el acceso del asesor.',
            },
            { status: 400 }
          );
        }

        authUserId = createdAuth.user.id;
        modo = 'creado';
      }
    }

    const { data: updatedProfile, error: updatedProfileError } = await admin
      .from('usuarios')
      .update({
        auth_id: authUserId,
        email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', asesorId)
      .select(USER_SELECT)
      .single();

    if (updatedProfileError || !updatedProfile) {
      return NextResponse.json(
        {
          error: 'No se pudo actualizar el perfil del asesor con las credenciales del portal.',
          details: updatedProfileError?.message ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        asesor: updatedProfile,
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
        },
        acceso: {
          email,
          modo,
        },
        message:
          modo === 'creado'
            ? `Acceso activado para ${email}.`
            : modo === 'enlazado'
              ? `Acceso enlazado y actualizado para ${email}.`
              : `Contraseña actualizada para ${email}.`,
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
