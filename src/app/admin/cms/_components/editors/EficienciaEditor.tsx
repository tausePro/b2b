'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface EficienciaItem {
  titulo: string;
  descripcion: string;
  icono: string;
}

export function EficienciaEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.eficiencia;
  if (!s) return null;
  const items = (s.contenido.items || []) as EficienciaItem[];

  return (
    <SectionCard id="eficiencia">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('eficiencia', { titulo: v })}
      />
      <TextareaInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('eficiencia', { subtitulo: v })}
      />
      <label className="block text-xs font-semibold text-slate-500">Items ({items.length})</label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Item {i + 1}</span>
            <button
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                updateContenido('eficiencia', 'items', next);
              }}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput
              label="Título"
              value={item.titulo}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...next[i], titulo: v };
                updateContenido('eficiencia', 'items', next);
              }}
            />
            <TextInput
              label="Ícono"
              value={item.icono}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...next[i], icono: v };
                updateContenido('eficiencia', 'items', next);
              }}
            />
          </div>
          <TextInput
            label="Descripción"
            value={item.descripcion}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], descripcion: v };
              updateContenido('eficiencia', 'items', next);
            }}
          />
        </div>
      ))}
      <button
        onClick={() =>
          updateContenido('eficiencia', 'items', [
            ...items,
            { titulo: '', descripcion: '', icono: '' },
          ])
        }
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar item
      </button>
    </SectionCard>
  );
}
