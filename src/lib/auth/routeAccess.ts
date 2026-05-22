import type { UserRole } from '@/types';
import type { RoleAwareUser } from '@/lib/auth/roles';
import { getEffectiveRoles } from '@/lib/auth/roles';

const ROLE_PATH_PREFIXES: Record<UserRole, string[]> = {
  super_admin: ['/admin'],
  comprador: [
    '/dashboard/catalogo',
    '/dashboard/carrito',
    '/dashboard/pedidos',
    '/dashboard/facturas',
    '/dashboard/alertas',
    '/dashboard/soporte',
    '/dashboard/perfil',
  ],
  aprobador: [
    '/dashboard/aprobaciones',
    '/dashboard/pedidos',
    '/dashboard/presupuestos',
    '/dashboard/alertas',
    '/dashboard/reportes',
    '/dashboard/perfil',
  ],
  asesor: [
    '/dashboard/gestion-pedidos',
    '/dashboard/clientes',
    '/dashboard/alertas',
    '/dashboard/reportes',
    '/dashboard/pedidos',
    '/dashboard/perfil',
  ],
  direccion: [
    '/dashboard/analitica',
    '/dashboard/equipo',
    '/dashboard/operativo',
    '/dashboard/clientes',
    '/dashboard/pedidos',
    '/dashboard/presupuestos',
    '/dashboard/alertas',
    '/dashboard/configuracion',
    '/dashboard/reportes',
    '/dashboard/perfil',
  ],
  editor_contenido: [
    '/admin/cms',
    '/admin/leads',
  ],
};

function normalizePath(path: string): string {
  if (path === '/') return path;
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Acepta tanto un rol simple (legacy) como un objeto con rol + rolesExtra
 * para soportar multi-rol por composición. Si recibe rol simple, se
 * comporta exactamente como antes.
 */
export function canAccessDashboardPath(
  roleOrUser: UserRole | RoleAwareUser,
  pathname: string,
): boolean {
  const effectiveRoles: UserRole[] =
    typeof roleOrUser === 'string' ? [roleOrUser] : getEffectiveRoles(roleOrUser);

  // super_admin tiene acceso total a todas las rutas (admin + dashboard)
  if (effectiveRoles.includes('super_admin')) {
    return true;
  }

  const normalizedPath = normalizePath(pathname);

  if (normalizedPath === '/dashboard') {
    return true;
  }

  // Unión de prefijos permitidos para todos los roles efectivos.
  const allowedPrefixes = effectiveRoles.flatMap((role) => ROLE_PATH_PREFIXES[role] ?? []);

  return allowedPrefixes.some((prefix) => {
    const normalizedPrefix = normalizePath(prefix);
    return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
  });
}
