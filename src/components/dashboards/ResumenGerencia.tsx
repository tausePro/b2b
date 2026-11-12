'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GerenciaTabs from '@/components/dashboards/GerenciaTabs';
import ResumenEjecutivo from '@/components/dashboards/ResumenEjecutivo';

/** Inicio de Gerencia: secciones (Resumen, Rentabilidad, Cartera, Comisiones) y el resumen ejecutivo. */
export default function ResumenGerencia() {
  const router = useRouter();
  // Enlaces antiguos con filtros del análisis (desde/hasta…) ahora abren la pestaña Rentabilidad.
  useEffect(() => {
    if (window.location.search.length > 1) router.replace(`/dashboard/gerencia${window.location.search}`);
  }, [router]);
  return (
    <div className="space-y-6">
      <GerenciaTabs />
      <ResumenEjecutivo />
    </div>
  );
}
