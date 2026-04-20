'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface CategoriaItem {
  titulo: string;
  descripcion: string;
  icono: string;
  imagen_url: string | null;
}

export function CategoriasEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.categorias;
  if (!s) return null;
  const items = (s.contenido.items || []) as CategoriaItem[];

  return (
    <SectionCard id="categorias">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('categorias', { titulo: v })}
      />
      <TextInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('categorias', { subtitulo: v })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Texto CTA"
          value={(s.contenido.cta_texto as string) || ''}
          onChange={(v) => updateContenido('categorias', 'cta_texto', v)}
        />
        <TextInput
          label="URL CTA"
          value={(s.contenido.cta_url as string) || ''}
          onChange={(v) => updateContenido('categorias', 'cta_url', v)}
        />
      </div>
      <label className="block text-xs font-semibold text-slate-500">
        Categorías ({items.length})
      </label>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Categoría {i + 1}</span>
            <button
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                updateContenido('categorias', 'items', next);
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
                updateContenido('categorias', 'items', next);
              }}
            />
            <TextInput
              label="Ícono"
              value={item.icono}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...next[i], icono: v };
                updateContenido('categorias', 'items', next);
              }}
            />
          </div>
          <TextInput
            label="Descripción"
            value={item.descripcion}
            onChange={(v) => {
              const next = [...items];
              next[i] = { ...next[i], descripcion: v };
              updateContenido('categorias', 'items', next);
            }}
          />
          <ImageUpload
            label="Imagen"
            currentUrl={item.imagen_url}
            onUpload={(url) => {
              const next = [...items];
              next[i] = { ...next[i], imagen_url: url || null };
              updateContenido('categorias', 'items', next);
            }}
            folder="categorias"
          />
        </div>
      ))}
      <button
        onClick={() =>
          updateContenido('categorias', 'items', [
            ...items,
            { titulo: '', descripcion: '', icono: '', imagen_url: null },
          ])
        }
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar categoría
      </button>
    </SectionCard>
  );
}
