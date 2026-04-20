'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface FaqItem {
  pregunta: string;
  respuesta: string;
}

export function PaginaFaqEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const id = 'pagina_faq';
  const s = secciones[id];
  if (!s) return null;
  const items = (s.contenido.items || []) as FaqItem[];

  return (
    <SectionCard id={id}>
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal(id, { titulo: v })}
      />
      <TextInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal(id, { subtitulo: v })}
      />
      <label className="block text-xs font-semibold text-slate-500">
        Preguntas ({items.length})
      </label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Pregunta {i + 1}</span>
            <button
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                updateContenido(id, 'items', next);
              }}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <TextInput
            label="Pregunta"
            value={item.pregunta}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], pregunta: v };
              updateContenido(id, 'items', next);
            }}
          />
          <TextareaInput
            label="Respuesta"
            value={item.respuesta}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], respuesta: v };
              updateContenido(id, 'items', next);
            }}
            rows={3}
          />
        </div>
      ))}
      <button
        onClick={() =>
          updateContenido(id, 'items', [...items, { pregunta: '', respuesta: '' }])
        }
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar pregunta
      </button>
    </SectionCard>
  );
}
