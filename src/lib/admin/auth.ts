import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const DEFAULT_ALLOWED_ROLES = ['super_admin', 'direccion'];

export function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

export interface AuthorizedAdminContext {
  admin: SupabaseAdminClient;
  perfil: {
    id: string;
    rol: string;
    activo: boolean;
  };
}

export async function authorizeAdmin(allowedRoles = DEFAULT_ALLOWED_ROLES): Promise<AuthorizedAdminContext | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: perfil, error: perfilError } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (perfilError || !perfil?.activo || !perfil.rol || !allowedRoles.includes(perfil.rol)) {
    return NextResponse.json({ error: 'FORBIDDEN', details: perfilError?.message ?? null }, { status: 403 });
  }

  return {
    admin,
    perfil: {
      id: String(perfil.id),
      rol: String(perfil.rol),
      activo: Boolean(perfil.activo),
    },
  };
}
