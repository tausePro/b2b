import type { UserRole } from '@/types';

export type MenuIcon =
  | 'dashboard' | 'catalog' | 'orders' | 'approvals' | 'invoices' | 'reports' | 'users' | 'trending'
  | 'alert' | 'settings' | 'support' | 'package' | 'money' | 'activity' | 'building' | 'userPlus' | 'truck' | 'wallet';

export interface MenuItem {
  label: string;
  href: string;
  icon: MenuIcon;
  activePattern: string;
  badge?: 'notificaciones';
}

/** Grupo del menú; `label: null` se muestra sin encabezado (portal de clientes). */
export interface MenuGroup {
  label: string | null;
  items: MenuItem[];
}

const item = (label: string, href: string, icon: MenuIcon, extra: Partial<MenuItem> = {}): MenuItem => ({
  label, href, icon, activePattern: href === '/dashboard' ? '/dashboard$' : href, ...extra,
});

export const MENU_BY_ROLE: Record<UserRole, MenuGroup[]> = {
  super_admin: [
    { label: 'Gerencia', items: [
      item('Resumen Ejecutivo', '/dashboard', 'dashboard'), item('Comisiones', '/dashboard/comisiones', 'money'),
      item('Presupuestos', '/dashboard/presupuestos', 'money'), item('Reportes', '/dashboard/reportes', 'reports'),
      item('Liquidación plataforma', '/dashboard/liquidacion-plataforma', 'invoices'),
    ] },
    { label: 'Comercial', items: [item('Clientes', '/dashboard/clientes', 'users'), item('Catálogo', '/dashboard/catalogo', 'catalog')] },
    { label: 'Operación', items: [item('Pedidos', '/dashboard/pedidos', 'orders'), item('Compras con proveedores', '/dashboard/compras', 'truck')] },
    { label: 'Sistema', items: [item('Panel Admin', '/admin', 'settings')] },
  ],
  comprador: [
    { label: null, items: [
      item('Catálogo', '/dashboard/catalogo', 'catalog'), item('Mis Pedidos', '/dashboard/pedidos', 'orders'),
      item('Informes', '/dashboard/reportes', 'reports'), item('Facturas', '/dashboard/facturas', 'invoices'), item('Soporte', '/dashboard/soporte', 'support'),
    ] },
  ],
  aprobador: [
    { label: null, items: [
      item('Dashboard', '/dashboard', 'dashboard'), item('Aprobaciones', '/dashboard/aprobaciones', 'approvals'),
      item('Pedidos', '/dashboard/pedidos', 'orders'), item('Presupuestos', '/dashboard/presupuestos', 'money'), item('Informes', '/dashboard/reportes', 'reports'),
    ] },
  ],
  asesor: [
    { label: 'Comercial', items: [
      item('Dashboard', '/dashboard', 'dashboard'), item('Mis Clientes', '/dashboard/clientes', 'users'),
      item('Catálogo', '/dashboard/catalogo', 'catalog'), item('Bono Plataforma', '/dashboard/comisiones', 'money'),
    ] },
    { label: 'Operación', items: [
      item('Gestión Pedidos', '/dashboard/gestion-pedidos', 'package'), item('Compras con proveedores', '/dashboard/compras', 'truck'),
      item('Reportes', '/dashboard/reportes', 'reports'),
    ] },
  ],
  direccion: [
    { label: 'Gerencia', items: [
      item('Resumen Ejecutivo', '/dashboard', 'dashboard'), item('Analítica Ventas', '/dashboard/analitica', 'trending'),
      item('Cartera', '/dashboard/cartera', 'wallet'), item('Comisiones', '/dashboard/comisiones', 'money'), item('Presupuestos', '/dashboard/presupuestos', 'money'),
      item('Liquidación plataforma', '/dashboard/liquidacion-plataforma', 'invoices'),
    ] },
    { label: 'Comercial', items: [
      item('Clientes', '/dashboard/clientes', 'building'), item('Leads', '/dashboard/leads', 'userPlus'),
      item('Productos por cliente', '/dashboard/productos-cliente', 'package'), item('Equipo Ventas', '/dashboard/equipo', 'users'),
    ] },
    { label: 'Operación', items: [
      item('Pedidos', '/dashboard/pedidos', 'orders'), item('Informes Pedidos', '/dashboard/reportes', 'reports'),
      item('Compras con proveedores', '/dashboard/compras', 'truck'), item('Control Operativo', '/dashboard/operativo', 'activity'),
    ] },
    { label: 'Sistema', items: [
      item('Alertas', '/dashboard/alertas', 'alert', { badge: 'notificaciones' }), item('Configuración', '/dashboard/configuracion', 'settings'),
    ] },
  ],
  editor_contenido: [
    { label: 'Contenido', items: [item('CMS Landing', '/admin/cms', 'invoices'), item('Leads', '/admin/leads', 'userPlus')] },
  ],
  cartera: [
    { label: 'Finanzas', items: [item('Dashboard', '/dashboard', 'dashboard'), item('Cartera', '/dashboard/cartera', 'wallet')] },
  ],
  compras: [
    { label: 'Operación', items: [
      item('Compras con proveedores', '/dashboard/compras', 'truck'), item('Pedidos', '/dashboard/pedidos', 'orders'), item('Catálogo', '/dashboard/catalogo', 'catalog'),
    ] },
  ],
};

/**
 * Menú del usuario: une los grupos del rol primario y de cada rol extra activo,
 * fusiona grupos con el mismo nombre y elimina opciones repetidas por href.
 */
export function buildMenuGroups(roles: readonly UserRole[]): MenuGroup[] {
  const groups: MenuGroup[] = [];
  const seenHrefs = new Set<string>();
  for (const group of roles.flatMap(role => MENU_BY_ROLE[role] ?? [])) {
    const items: MenuItem[] = [];
    for (const entry of group.items) {
      if (seenHrefs.has(entry.href)) continue;
      seenHrefs.add(entry.href);
      items.push(entry);
    }
    if (items.length === 0) continue;
    const existing = groups.find(candidate => candidate.label === group.label);
    if (existing) existing.items.push(...items);
    else groups.push({ label: group.label, items });
  }
  return groups;
}

export function isMenuItemActive(pathname: string, pattern: string): boolean {
  return pattern === '/dashboard$' ? pathname === '/dashboard' : pathname.startsWith(pattern);
}

const SHORT_LABELS: Record<string, string> = {
  'Resumen Ejecutivo': 'Resumen', 'Compras con proveedores': 'Compras', 'Gestión Pedidos': 'Pedidos', 'Mis Clientes': 'Clientes',
  'Bono Plataforma': 'Bono', 'CMS Landing': 'CMS', 'Mis Pedidos': 'Pedidos', 'Panel Admin': 'Admin',
};

/** Barra inferior del celular: 4 destinos (Gerencia según la propuesta; los demás, sus primeras opciones del menú). */
export function buildMobileDestinations(roles: readonly UserRole[]): MenuItem[] {
  if (roles.some(role => role === 'direccion' || role === 'super_admin')) {
    return [
      item('Resumen', '/dashboard', 'dashboard'), item('Ventas', '/dashboard/analitica', 'trending'),
      item('Pedidos', '/dashboard/por-facturar', 'orders'), item('Cartera', '/dashboard/cartera', 'wallet'),
    ];
  }
  return buildMenuGroups(roles).flatMap(group => group.items).slice(0, 4).map(entry => ({ ...entry, label: SHORT_LABELS[entry.label] ?? entry.label }));
}
