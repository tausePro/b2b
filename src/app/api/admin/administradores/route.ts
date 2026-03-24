import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const INTERNAL_ROLES = new Set(['super_admin', 'asesor', 'direccion', 'editor_contenido'] as const);
type InternalRole = 'super_admin' | 'asesor' | 'direccion' | 'editor_contenido';

const USER_SELECT =
  'id, auth_id, odoo_user_id, email, nombre, apellido, rol, empresa_id, activo, created_at, updated_at';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, authUserId: string) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (error || !data || data.rol !== 'super_admin' || !data.activo) {
    return null;
  }
  return data;
}

// GET — Listar todos los usuarios internos Imprima
export async function GET() {
  try {
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

    const { data: usuarios, error: queryError } = await admin
      .from('usuarios')
      .select(USER_SELECT)
      .in('rol', ['super_admin', 'asesor', 'direccion', 'editor_contenido'])
      .order('created_at', { ascending: false });

    if (queryError) {
      return NextResponse.json(
        { error: 'Error consultando usuarios.', details: queryError.message },
        { status: 500 }
      );
    }

    // Para asesores, traer sus empresas asignadas
    const asesorIds = (usuarios ?? [])
      .filter((u) => u.rol === 'asesor')
      .map((u) => u.id);

    let asignaciones: Record<string, { empresa_id: string; empresa_nombre: string }[]> = {};

    if (asesorIds.length > 0) {
      const { data: ae } = await admin
        .from('asesor_empresas')
        .select('usuario_id, empresa_id, empresas(nombre)')
        .in('usuario_id', asesorIds)
        .eq('activo', true);

      if (ae) {
        for (const row of ae) {
          const uid = row.usuario_id as string;
          if (!asignaciones[uid]) asignaciones[uid] = [];
          asignaciones[uid].push({
            empresa_id: row.empresa_id as string,
            empresa_nombre: (row.empresas as unknown as { nombre: string })?.nombre ?? '',
          });
        }
      }
    }

    const result = (usuarios ?? []).map((u) => ({
      ...u,
      empresas_asignadas: asignaciones[u.id] ?? [],
    }));

    return NextResponse.json({ usuarios: result });
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

// POST — Crear nuevo usuario interno Imprima
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const nombre = body.nombre?.trim();
    const apellido = body.apellido?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    const rol = body.rol as InternalRole;

    if (!nombre || !apellido || !email || !password || !rol) {
      return NextResponse.json(
        { error: 'Faltan datos obligatorios: nombre, apellido, email, password, rol.' },
        { status: 400 }
      );
    }

    if (!INTERNAL_ROLES.has(rol)) {
      return NextResponse.json(
        { error: 'Rol no válido. Roles permitidos: super_admin, asesor, direccion, editor_contenido.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña temporal debe tener al menos 8 caracteres.' },
        { status: 400 }
      );
    }

    // Verificar email duplicado
    const { data: existing } = await admin
      .from('usuarios')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un usuario con ese email en la plataforma.' },
        { status: 409 }
      );
    }

    // Crear en auth
    const { data: authCreation, error: authCreationError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido, rol },
    });

    if (authCreationError || !authCreation.user) {
      return NextResponse.json(
        { error: authCreationError?.message ?? 'No se pudo crear el usuario en autenticación.' },
        { status: 400 }
      );
    }

    // Crear perfil (empresa_id = null para roles internos)
    const { data: profile, error: profileError } = await admin
      .from('usuarios')
      .insert({
        auth_id: authCreation.user.id,
        email,
        nombre,
        apellido,
        rol,
        empresa_id: null,
        sede_id: null,
        activo: true,
      })
      .select(USER_SELECT)
      .single();

    if (profileError || !profile) {
      // Rollback: eliminar usuario auth
      await admin.auth.admin.deleteUser(authCreation.user.id);
      return NextResponse.json(
        { error: 'No se pudo crear el perfil.', details: profileError?.message ?? null },
        { status: 500 }
      );
    }

    return NextResponse.json({ usuario: { ...profile, empresas_asignadas: [] } }, { status: 201 });
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
