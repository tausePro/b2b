'use client';

import BrandMark from '@/components/ui/BrandMark';
import { useAuth } from '@/contexts/AuthContext';
import type { PortalBranding, UserRole } from '@/types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingBag,
  ClipboardList,
  CheckSquare,
  FileText,
  BarChart3,
  Users,
  TrendingUp,
  AlertTriangle,
  Settings,
  Headphones,
  Package,
  DollarSign,
  Activity,
  X,
} from 'lucide-react';

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  activePattern: string;
}

const MENU_BY_ROLE: Record<UserRole, SidebarItem[]> = {
  super_admin: [], // Super Admin usa /admin con layout propio
  comprador: [
    { label: 'Catálogo', href: '/dashboard/catalogo', icon: <ShoppingBag className="w-5 h-5" />, activePattern: '/dashboard/catalogo' },
    { label: 'Mis Pedidos', href: '/dashboard/pedidos', icon: <ClipboardList className="w-5 h-5" />, activePattern: '/dashboard/pedidos' },
    { label: 'Facturas', href: '/dashboard/facturas', icon: <FileText className="w-5 h-5" />, activePattern: '/dashboard/facturas' },
    { label: 'Soporte', href: '/dashboard/soporte', icon: <Headphones className="w-5 h-5" />, activePattern: '/dashboard/soporte' },
  ],
  aprobador: [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, activePattern: '/dashboard$' },
    { label: 'Aprobaciones', href: '/dashboard/aprobaciones', icon: <CheckSquare className="w-5 h-5" />, activePattern: '/dashboard/aprobaciones' },
    { label: 'Pedidos', href: '/dashboard/pedidos', icon: <ClipboardList className="w-5 h-5" />, activePattern: '/dashboard/pedidos' },
    { label: 'Presupuestos', href: '/dashboard/presupuestos', icon: <DollarSign className="w-5 h-5" />, activePattern: '/dashboard/presupuestos' },
    { label: 'Reportes', href: '/dashboard/reportes', icon: <BarChart3 className="w-5 h-5" />, activePattern: '/dashboard/reportes' },
  ],
  asesor: [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, activePattern: '/dashboard$' },
    { label: 'Gestión Pedidos', href: '/dashboard/gestion-pedidos', icon: <Package className="w-5 h-5" />, activePattern: '/dashboard/gestion-pedidos' },
    { label: 'Mis Clientes', href: '/dashboard/clientes', icon: <Users className="w-5 h-5" />, activePattern: '/dashboard/clientes' },
    { label: 'Reportes', href: '/dashboard/reportes', icon: <BarChart3 className="w-5 h-5" />, activePattern: '/dashboard/reportes' },
  ],
  direccion: [
    { label: 'Resumen Ejecutivo', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, activePattern: '/dashboard$' },
    { label: 'Analítica Ventas', href: '/dashboard/analitica', icon: <TrendingUp className="w-5 h-5" />, activePattern: '/dashboard/analitica' },
    { label: 'Equipo Ventas', href: '/dashboard/equipo', icon: <Users className="w-5 h-5" />, activePattern: '/dashboard/equipo' },
    { label: 'Control Operativo', href: '/dashboard/operativo', icon: <Activity className="w-5 h-5" />, activePattern: '/dashboard/operativo' },
    { label: 'Presupuestos', href: '/dashboard/presupuestos', icon: <DollarSign className="w-5 h-5" />, activePattern: '/dashboard/presupuestos' },
    { label: 'Alertas', href: '/dashboard/alertas', icon: <AlertTriangle className="w-5 h-5" />, activePattern: '/dashboard/alertas' },
    { label: 'Configuración', href: '/dashboard/configuracion', icon: <Settings className="w-5 h-5" />, activePattern: '/dashboard/configuracion' },
  ],
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  portalBranding?: PortalBranding | null;
}

export default function Sidebar({ isOpen, onClose, portalBranding }: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const menuItems = MENU_BY_ROLE[user.rol];
  const isClientPortal = Boolean(
    portalBranding && (user.rol === 'comprador' || user.rol === 'aprobador')
  );

  const isActive = (pattern: string) => {
    if (pattern === '/dashboard$') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(pattern);
  };

  return (
    <>
      {/* Overlay móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-16 left-0 bottom-0 w-64 bg-white border-r border-border z-40 transition-transform duration-200 ease-in-out',
          'lg:translate-x-0 lg:static lg:top-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Botón cerrar móvil */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">
            {isClientPortal && portalBranding ? portalBranding.empresa_nombre : 'Menú'}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-background-light">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {isClientPortal && portalBranding && (
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
              <BrandMark
                name={portalBranding.empresa_nombre}
                logoUrl={portalBranding.logo_url}
                color={portalBranding.color_primario}
                className="h-12 w-12 rounded-xl border border-white/80 bg-white p-1 shadow-sm"
                imageClassName="p-1"
                initialsClassName="text-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {portalBranding.empresa_nombre}
                </p>
                <p className="mt-0.5 text-xs text-primary">
                  {portalBranding.slug || 'Portal cliente'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navegación */}
        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const active = isActive(item.activePattern);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-background-light hover:text-foreground'
                )}
              >
                <span className={cn(active ? 'text-primary' : 'text-muted')}>
                  {item.icon}
                </span>
                {item.label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer del sidebar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="bg-primary/5 rounded-lg p-3">
            <p className="text-xs font-semibold text-primary">
              {isClientPortal && portalBranding ? portalBranding.empresa_nombre : 'Imprima B2B'}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {isClientPortal ? 'Portal corporativo personalizado' : 'v1.0.0 — Plataforma Corporativa'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
