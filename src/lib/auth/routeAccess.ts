import type { UserRole } from '@/types';

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
};

function normalizePath(path: string): string {
  if (path === '/') return path;
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function canAccessDashboardPath(role: UserRole, pathname: string): boolean {
  // super_admin tiene acceso total a todas las rutas (admin + dashboard)
  if (role === 'super_admin') {
    return true;
  }

  const normalizedPath = normalizePath(pathname);
  const allowedPrefixes = ROLE_PATH_PREFIXES[role] ?? [];

  if (normalizedPath === '/dashboard') {
    return true;
  }

  return allowedPrefixes.some((prefix) => {
    const normalizedPrefix = normalizePath(prefix);
    return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
  });
}
