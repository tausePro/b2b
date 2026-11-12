'use client';

import BrandMark from '@/components/ui/BrandMark';
import { useAuth } from '@/contexts/AuthContext';
import type { PortalBranding } from '@/types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUnreadNotifications } from '@/lib/notifications/useUnreadNotifications';
import { buildMenuGroups, isMenuItemActive, type MenuIcon } from '@/lib/navigation/menu';
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
  Building2,
  X,
  UserPlus,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const MENU_ICONS: Record<MenuIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  catalog: ShoppingBag,
  orders: ClipboardList,
  approvals: CheckSquare,
  invoices: FileText,
  reports: BarChart3,
  users: Users,
  trending: TrendingUp,
  alert: AlertTriangle,
  settings: Settings,
  support: Headphones,
  package: Package,
  money: DollarSign,
  activity: Activity,
  building: Building2,
  userPlus: UserPlus,
  truck: Truck,
  wallet: Wallet,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  portalBranding?: PortalBranding | null;
}

export default function Sidebar({ isOpen, onClose, portalBranding }: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const unreadCount = useUnreadNotifications(user?.id);

  if (!user) return null;

  // Un usuario multi-rol ve la unión de los menús de su rol primario y sus roles extra.
  const menuGroups = buildMenuGroups([user.rol, ...(user.rolesExtra ?? [])]);
  const isClientPortal = Boolean(
    portalBranding && (user.rol === 'comprador' || user.rol === 'aprobador')
  );

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
          'fixed top-16 left-0 bottom-0 w-64 bg-white border-r border-border z-40 transition-transform duration-200 ease-in-out flex flex-col',
          'lg:translate-x-0 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:shrink-0',
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
        <nav aria-label="Menú principal" className="flex-1 overflow-y-auto p-3 space-y-4">
          {menuGroups.map((group, index) => {
            const headingId = group.label ? `menu-grupo-${index}` : undefined;
            return (
              <div key={group.label ?? `grupo-${index}`}>
                {group.label && (
                  <h2 id={headingId} className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {group.label}
                  </h2>
                )}
                <ul aria-labelledby={headingId} className="space-y-1">
                  {group.items.map((item) => {
                    const active = isMenuItemActive(pathname, item.activePattern);
                    const badge = item.badge === 'notificaciones' && unreadCount > 0 ? unreadCount : null;
                    const Icon = MENU_ICONS[item.icon];
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            active
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted hover:bg-background-light hover:text-foreground'
                          )}
                        >
                          <Icon className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted')} aria-hidden="true" />
                          {item.label}
                          {badge !== null ? (
                            <span className="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-xs font-semibold text-white">
                              {badge > 99 ? '99+' : badge}
                              <span className="sr-only"> sin leer</span>
                            </span>
                          ) : active && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Footer del sidebar */}
        <div className="shrink-0 p-4 border-t border-border">
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
