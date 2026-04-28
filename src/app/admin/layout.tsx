'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  LayoutDashboard,
  Building2,
  Receipt,
  RefreshCw,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  FileText,
  UserPlus,
  Package,
} from 'lucide-react';

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
}

interface MenuSection {
  label: string;
  items: MenuItem[];
}

const ADMIN_ROLES = ['super_admin', 'direccion', 'editor_contenido'];

const allMenuSections: (MenuSection & { roles?: string[] })[] = [
  {
    label: 'Resumen',
    roles: ['super_admin', 'direccion'],
    items: [
      { href: '/admin', label: 'Panel de Control', icon: LayoutDashboard },
      { href: '/admin/empresas', label: 'Empresas', icon: Building2 },
      { href: '/admin/pedidos', label: 'Pedidos', icon: Receipt },
      { href: '/admin/sincronizacion', label: 'Sincronización Odoo', icon: RefreshCw },
    ],
  },
  {
    label: 'Contenido',
    items: [
      { href: '/admin/cms', label: 'CMS Landing', icon: FileText },
      { href: '/admin/empaques', label: 'Empaques', icon: Package },
      { href: '/admin/leads', label: 'Leads', icon: UserPlus },
    ],
  },
  {
    label: 'Ajustes',
    roles: ['super_admin'],
    items: [
      { href: '/admin/administradores', label: 'Administradores', icon: Users },
      { href: '/admin/configuracion', label: 'Configuración', icon: Settings },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  direccion: 'Dirección',
  editor_contenido: 'Editor Contenido',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, supabaseUser, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        if (supabaseUser) {
          console.warn('[AdminLayout] Sesión auth activa sin perfil. Redirigiendo a /dashboard');
          router.replace('/dashboard');
        } else {
          console.warn('[AdminLayout] Sin sesión activa. Redirigiendo a /login');
          router.replace('/login');
        }
      } else if (!ADMIN_ROLES.includes(user.rol)) {
        console.warn('[AdminLayout] Rol no autorizado:', user.rol);
        router.replace('/dashboard');
      }
    }
  }, [loading, user, supabaseUser, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-slate-500">Cargando panel de administración...</p>
        </div>
      </div>
    );
  }

  if (!user || !ADMIN_ROLES.includes(user.rol)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-slate-500">
            {user
              ? 'Redirigiendo al panel autorizado...'
              : supabaseUser
                ? 'Redirigiendo al dashboard para resolver tu perfil...'
                : 'Redirigiendo al inicio de sesión...'}
          </p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const renderSidebarContent = (onNavigate?: () => void) => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xl">I</div>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Imprima<span className="text-primary">.Admin</span>
          </span>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {allMenuSections.filter((s) => !s.roles || s.roles.includes(user.rol)).map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-2 mt-4 first:mt-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-primary'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                  {'badge' in item && item.badge && (
                    <span className="ml-auto bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
            {user.nombre[0]}{user.apellido[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.nombre} {user.apellido}</p>
            <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[user.rol] || user.rol}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-background-light font-display antialiased">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-64 flex-col bg-white border-r border-border flex-shrink-0 z-20">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white border-r border-border flex flex-col">
            <div className="absolute right-3 top-4">
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarContent(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-border px-8 py-5 flex items-center justify-between shadow-sm z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 mr-3"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <div className="relative hidden lg:block">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                className="block w-64 pl-10 pr-3 py-2 border border-border rounded-lg leading-5 bg-slate-50 text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                placeholder="Buscar empresas o pedidos..."
                type="text"
              />
            </div>
            <button className="relative p-2 text-slate-400 hover:text-slate-500">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
