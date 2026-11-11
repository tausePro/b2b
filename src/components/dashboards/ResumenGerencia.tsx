'use client';

import { useState } from 'react';
import GerenciaFinanzas from '@/components/dashboards/GerenciaFinanzas';
import ResumenEjecutivo from '@/components/dashboards/ResumenEjecutivo';

/** Resumen ejecutivo arriba; el análisis detallado actual queda plegado y solo carga al abrirlo. */
export default function ResumenGerencia() {
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.location.search.length > 1);
  return (
    <div className="space-y-6">
      <ResumenEjecutivo />
      <details open={open} className="rounded-xl border border-border bg-white" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer px-5 py-4 font-semibold">Análisis detallado: rentabilidad por asesora, cliente y producto, comisiones y cartera</summary>
        {open && <div className="border-t border-border p-4"><GerenciaFinanzas /></div>}
      </details>
    </div>
  );
}
