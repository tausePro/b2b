import { createServerSupabaseClient } from '@/lib/supabase/server';

export type RolCms = 'super_admin' | 'direccion' | 'editor_contenido';

export interface AuthCmsContext {
  authId: string;
  rol: RolCms;
}

const ROLES_CMS: ReadonlySet<RolCms> = new Set(['super_admin', 'direccion', 'editor_contenido']);

function esRolCms(valor: string | null | undefined): valor is RolCms {
  return typeof valor === 'string' && ROLES_CMS.has(valor as RolCms);
}

/**
 * Verifica que exista un usuario autenticado con rol autorizado para el CMS.
 * Devuelve su auth_id y rol si está autorizado, null en caso contrario.
 */
export async function obtenerContextoCms(): Promise<AuthCmsContext | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('auth_id', user.id)
      .single<{ rol: string }>();

    if (!esRolCms(perfil?.rol)) return null;
    return { authId: user.id, rol: perfil.rol };
  } catch {
    return null;
  }
}
