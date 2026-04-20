'use client';

import { ChevronDown, ChevronRight, History, Rocket, Undo2 } from 'lucide-react';
import { useCmsCtx } from '../_context';
import { SECTION_LABELS } from '../_types';
import { ActiveToggle, SaveButton } from './FormControls';

// Tarjeta contenedora de cada sección: cabecera colapsable, toggle activo y
// footer con botones "Historial" + "Guardar" y, si hay borrador pendiente,
// "Descartar borrador" + "Publicar".
export function SectionCard({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    secciones,
    expandedSections,
    saving,
    toggleSection,
    setHistorialSeccion,
    publicarSeccion,
    descartarBorrador,
  } = useCmsCtx();
  const expanded = expandedSections.has(id);
  const sec = secciones[id];
  const tieneBorrador = sec?.tiene_borrador === true;
  const isBusy = saving === id;

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
          {tieneBorrador && (
            <span
              className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold border border-amber-200"
              title="Hay cambios guardados como borrador, aún no publicados"
            >
              Borrador sin publicar
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
          <div className="flex justify-end items-center gap-2 pt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setHistorialSeccion(id)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-primary hover:bg-slate-100 px-3 py-2.5 rounded-lg transition-colors"
              title="Ver historial de cambios"
            >
              <History className="w-4 h-4" />
              Historial
            </button>
            {tieneBorrador && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Descartar los cambios del borrador y volver al contenido publicado?',
                    )
                  ) {
                    void descartarBorrador(id);
                  }
                }}
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                title="Descartar borrador y volver al publicado"
              >
                <Undo2 className="w-4 h-4" />
                Descartar borrador
              </button>
            )}
            <SaveButton id={id} />
            {tieneBorrador && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (window.confirm('¿Publicar el borrador al sitio público?')) {
                    void publicarSeccion(id);
                  }
                }}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition-all disabled:opacity-50"
                title="Promover borrador a contenido publicado"
              >
                <Rocket className="w-4 h-4" />
                Publicar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
