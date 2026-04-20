'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface TestimonioItem {
  nombre: string;
  cargo: string;
  empresa: string;
  texto: string;
  estrellas: number;
}

export function TestimoniosEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.testimonios;
  if (!s) return null;
  const items = (s.contenido.items || []) as TestimonioItem[];

  return (
    <SectionCard id="testimonios">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('testimonios', { titulo: v })}
      />
      <TextInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('testimonios', { subtitulo: v })}
      />
      <label className="block text-xs font-semibold text-slate-500">
        Testimonios ({items.length})
      </label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {item.nombre || `Testimonio ${i + 1}`}
            </span>
            <button
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                updateContenido('testimonios', 'items', next);
              }}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextInput
              label="Nombre"
              value={item.nombre}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...next[i], nombre: v };
                updateContenido('testimonios', 'items', next);
              }}
            />
            <TextInput
              label="Cargo"
              value={item.cargo}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...next[i], cargo: v };
                updateContenido('testimonios', 'items', next);
              }}
            />
            <TextInput
              label="Empresa"
              value={item.empresa}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...next[i], empresa: v };
                updateContenido('testimonios', 'items', next);
              }}
            />
          </div>
          <TextareaInput
            label="Texto"
            value={item.texto}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], texto: v };
              updateContenido('testimonios', 'items', next);
            }}
            rows={2}
          />
          <TextInput
            label="Estrellas (1-5)"
            value={String(item.estrellas)}
            onChange={(v) => {
              const next = [...items];
              next[i] = {
                ...next[i],
                estrellas: Math.min(5, Math.max(1, parseInt(v) || 5)),
              };
              updateContenido('testimonios', 'items', next);
            }}
            type="number"
          />
        </div>
      ))}
      <button
        onClick={() =>
          updateContenido('testimonios', 'items', [
            ...items,
            { nombre: '', cargo: '', empresa: '', texto: '', estrellas: 5 },
          ])
        }
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar testimonio
      </button>
    </SectionCard>
  );
}
