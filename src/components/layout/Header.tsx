'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { createClient } from '@/lib/supabase/client';
import BrandMark from '@/components/ui/BrandMark';
import { ROLE_CONFIG, type PortalBranding } from '@/types';
import {
  Search,
  ShoppingCart,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Menu,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface HeaderProps {
  onToggleSidebar: () => void;
  portalBranding?: PortalBranding | null;
}

export default function Header({ onToggleSidebar, portalBranding }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { totalItems } = useCart();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [supabase] = useState(() => createClient());
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from('notificaciones')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .eq('leida', false);

      if (!active) return;

      if (error) {
        console.warn('Error cargando contador de notificaciones:', error);
        setUnreadCount(0);
        return;
      }

      setUnreadCount(count ?? 0);
    };

    void fetchUnreadCount();

    const channel = supabase
      .channel(`header-notificaciones-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${user.id}`,
        },
        () => {
          void fetchUnreadCount();
        }
      )
      .subscribe();

    // Re-fetch cuando el usuario vuelve a la pestaña
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Polling cada 30s como respaldo
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    }, 30000);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  if (!user) return null;

  const roleLabel = ROLE_CONFIG[user.rol].label;
  const isClientPortal = Boolean(
    portalBranding && (user.rol === 'comprador' || user.rol === 'aprobador')
  );

  return (
    <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Izquierda: Toggle + Logo + Búsqueda */}
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg hover:bg-background-light transition-colors"
        >
          <Menu className="w-5 h-5 text-muted" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
          {isClientPortal && portalBranding ? (
            <>
              <BrandMark
                name={portalBranding.empresa_nombre}
                logoUrl={portalBranding.logo_url}
                color={portalBranding.color_primario}
                className="h-10 w-10 rounded-xl border border-border bg-white p-1"
                imageClassName="p-1"
                initialsClassName="text-sm"
              />
              <div className="hidden sm:block min-w-0">
                <p className="truncate text-sm font-bold text-foreground leading-tight">
                  {portalBranding.empresa_nombre}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-primary">
                    {portalBranding.slug || 'Portal cliente'}
                  </span>
                  <span className="rounded-full bg-background-light px-2 py-0.5 text-[11px] font-medium text-muted">
                    B2B
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="text-xl font-bold text-primary">Imprima</span>
              <span className="text-xs font-medium text-muted bg-background-light px-2 py-0.5 rounded-full">B2B</span>
            </>
          )}
        </Link>

        <div className="hidden md:flex items-center flex-1 max-w-md ml-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar productos, pedidos..."
              className="w-full pl-10 pr-4 py-2 bg-background-light border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* Derecha: Acciones */}
      <div className="flex items-center gap-3">
        {/* Carrito - solo para compradores */}
        {user.rol === 'comprador' && (
          <Link
            href="/dashboard/carrito"
            className="relative p-2 rounded-lg hover:bg-background-light transition-colors"
          >
            <ShoppingCart className="w-5 h-5 text-muted" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
        )}

        {/* Notificaciones */}
        <Link
          href="/dashboard/alertas"
          className="relative p-2 rounded-lg hover:bg-background-light transition-colors"
        >
          <Bell className="w-5 h-5 text-muted" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Perfil */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-background-light transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {user.nombre[0]}{user.apellido[0]}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-foreground leading-tight">
                {user.nombre} {user.apellido}
              </p>
              <p className="text-xs text-muted leading-tight">{roleLabel}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-border py-2 z-50">
                <div className="px-4 py-2 border-b border-border">
                  <p className="text-sm font-medium">{user.nombre} {user.apellido}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                  {isClientPortal && portalBranding && (
                    <p className="mt-1 text-xs text-muted">{portalBranding.empresa_nombre}</p>
                  )}
                  <span className="inline-block mt-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {roleLabel}
                  </span>
                </div>
                <Link
                  href="/dashboard/perfil"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-background-light transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User className="w-4 h-4" />
                  Mi Perfil
                </Link>
                <button
                  onClick={async () => {
                    setShowUserMenu(false);
                    await signOut();
                    router.push('/login');
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger/5 transition-colors w-full"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
