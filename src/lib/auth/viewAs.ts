export const VIEW_AS_COOKIE = 'b2b_view_as';
export const VIEW_AS_EXPIRES_COOKIE = 'b2b_view_as_exp';
export const VIEW_AS_UI_COOKIE = 'b2b_view_as_ui';
export const VIEW_AS_MAX_MS = 8 * 60 * 60 * 1000;
export const VIEW_AS_EXIT_PATH = '/api/admin/ver-como/salir';
export const VIEW_AS_READ_ONLY_MESSAGE = 'Modo "ver como": solo lectura. Sal del modo para hacer cambios.';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isViewAsRequestAllowed(method: string, pathname: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase()) || pathname === VIEW_AS_EXIT_PATH;
}

export function isViewAsSupabaseRequestAllowed(url: string, method: string, supabaseUrl: string): boolean {
  const target = new URL(url);
  if (target.origin !== new URL(supabaseUrl).origin) return true;
  const verb = method.toUpperCase();
  if (SAFE_METHODS.has(verb)) return true;
  if (verb !== 'POST') return false;
  if (target.pathname === '/auth/v1/token') return target.searchParams.get('grant_type') === 'refresh_token';
  return /^\/rest\/v1\/rpc\/get_[a-z0-9_]+$/.test(target.pathname);
}

export function readViewAsUiCookie(cookie: string): string | null {
  const entry = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${VIEW_AS_UI_COOKIE}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(VIEW_AS_UI_COOKIE.length + 1)) || null;
  } catch {
    return null;
  }
}
