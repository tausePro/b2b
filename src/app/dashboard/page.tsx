'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import DashboardComprador from '@/components/dashboards/DashboardComprador';
import DashboardAprobador from '@/components/dashboards/DashboardAprobador';
import DashboardAsesor from '@/components/dashboards/DashboardAsesor';
import DashboardDireccion from '@/components/dashboards/DashboardDireccion';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (user?.rol === 'super_admin') {
      setIsRedirecting(true);
      // Pequeño timeout para asegurar que el router esté listo y evitar AbortError
      const timer = setTimeout(() => {
        if (mounted) router.replace('/admin');
      }, 0);
      return () => {
        mounted = false;
        clearTimeout(timer);
      };
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full mt-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted">Cargando perfil...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 mt-20">
        <h2 className="text-xl font-bold text-red-600">Error: Perfil no encontrado</h2>
        <p className="text-muted max-w-md">
          Has iniciado sesión correctamente, pero no se encontró tu perfil en la base de datos (tabla <code>public.usuarios</code>).
        </p>
        <p className="text-sm bg-yellow-50 text-yellow-800 p-4 rounded-lg border border-yellow-200 text-left">
          <strong>Solución:</strong> Ejecuta el archivo <code>002_seed_data.sql</code> o <code>006_emergency_seed.sql</code> en el SQL Editor de Supabase para enlazar tu usuario Auth con la tabla de perfiles y asignarte el rol <code>super_admin</code>.
        </p>
      </div>
    );
  }

  if (user.rol === 'super_admin' || isRedirecting) {
    return (
      <div className="flex flex-col items-center justify-center h-full mt-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted">Redirigiendo al panel de administración...</p>
      </div>
    );
  }

  switch (user.rol) {
    case 'comprador':
      return <DashboardComprador />;
    case 'aprobador':
      return <DashboardAprobador />;
    case 'asesor':
      return <DashboardAsesor />;
    case 'direccion':
      return <DashboardDireccion />;
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-4 mt-20">
          <h2 className="text-xl font-bold text-red-600">Error de Rol</h2>
          <p className="text-muted">
            Tu usuario tiene un rol no reconocido: <strong>{user.rol}</strong>
          </p>
        </div>
      );
  }
}
