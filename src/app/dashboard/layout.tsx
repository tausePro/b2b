'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { canAccessDashboardPath } from '@/lib/auth/routeAccess';
import { createClient } from '@/lib/supabase/client';
import type { PortalBranding } from '@/types';
import { getBrandingCssVariables } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [portalBranding, setPortalBranding] = useState<PortalBranding | null>(null);
  const [supabase] = useState(() => createClient());
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const isClientPortal = Boolean(
    user?.empresa_id && (user.rol === 'comprador' || user.rol === 'aprobador')
  );

  useEffect(() => {
    if (!user?.empresa_id || !isClientPortal) {
      setPortalBranding(null);
      return;
    }

    let cancelled = false;

    const fetchPortalBranding = async () => {
      const [empresaRes, configRes] = await Promise.all([
        supabase
          .from('empresas')
          .select('id, nombre')
          .eq('id', user.empresa_id)
          .maybeSingle(),
        supabase
          .from('empresa_configs')
          .select('slug, logo_url, color_primario')
          .eq('empresa_id', user.empresa_id)
          .maybeSingle(),
      ]);

      if (cancelled || empresaRes.error || !empresaRes.data) {
        if (!cancelled) {
          setPortalBranding(null);
        }
        return;
      }

      setPortalBranding({
        empresa_id: empresaRes.data.id,
        empresa_nombre: empresaRes.data.nombre,
        slug: configRes.data?.slug ?? null,
        logo_url: configRes.data?.logo_url ?? null,
        color_primario: configRes.data?.color_primario ?? null,
      });
    };

    void fetchPortalBranding();

    return () => {
      cancelled = true;
    };
  }, [isClientPortal, supabase, user?.empresa_id]);

  const portalStyle = useMemo(() => {
    if (!isClientPortal) {
      return undefined;
    }

    return getBrandingCssVariables(portalBranding?.color_primario) as CSSProperties;
  }, [isClientPortal, portalBranding?.color_primario]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // En lugar de null (pantalla blanca), renderizamos el contenedor básico
    // para que page.tsx pueda mostrar el mensaje de error de "Perfil no encontrado"
    return (
      <div className="min-h-screen bg-background-light" style={portalStyle}>
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} portalBranding={portalBranding} />
        <main className="p-4 lg:p-6 min-h-[calc(100vh-4rem)] overflow-auto">
          {children}
        </main>
      </div>
    );
  }

  const routeAllowed = canAccessDashboardPath(user.rol, pathname);

  if (!routeAllowed) {
    return (
      <div className="min-h-screen bg-background-light" style={portalStyle}>
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} portalBranding={portalBranding} />
        <div className="flex">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} portalBranding={portalBranding} />
          <main className="flex-1 p-4 lg:p-6 min-h-[calc(100vh-4rem)] overflow-auto">
            <div className="max-w-xl rounded-xl border border-danger/30 bg-danger/5 p-6">
              <h2 className="text-lg font-semibold text-danger">Acceso no permitido</h2>
              <p className="mt-2 text-sm text-muted">
                Esta sección no está habilitada para tu rol actual. Usa el menú lateral para navegar por los módulos
                disponibles en tu portal.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light" style={portalStyle}>
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} portalBranding={portalBranding} />
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} portalBranding={portalBranding} />
        <main className="flex-1 p-4 lg:p-6 min-h-[calc(100vh-4rem)] overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
