'use client';

import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { useCmsCtx } from '../_context';
import { SECTION_LABELS } from '../_types';
import { ActiveToggle, SaveButton } from './FormControls';

// Tarjeta contenedora de cada sección: cabecera colapsable, toggle activo y
// footer con botones "Historial" y "Guardar".
// Replica el comportamiento exacto del editor monolítico anterior.
export function SectionCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { secciones, expandedSections, toggleSection, setHistorialSeccion } = useCmsCtx();
  const expanded = expandedSections.has(id);
  const sec = secciones[id];

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleSection(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggleSection(id);
        }}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-sm font-semibold text-slate-800">
            {SECTION_LABELS[id] || id}
          </span>
          {sec && !sec.activo && (
            <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">
              Inactivo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <ActiveToggle id={id} />
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 border-t border-border space-y-4 pt-4">
          {children}
          <div className="flex justify-end items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setHistorialSeccion(id)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-primary hover:bg-slate-100 px-3 py-2.5 rounded-lg transition-colors"
              title="Ver historial de cambios"
            >
              <History className="w-4 h-4" />
              Historial
            </button>
            <SaveButton id={id} />
          </div>
        </div>
      )}
    </div>
  );
}
