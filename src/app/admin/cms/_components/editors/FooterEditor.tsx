'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface FooterLink {
  texto: string;
  url: string;
}

interface FooterColumna {
  titulo: string;
  links: FooterLink[];
}

export function FooterEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.footer;
  if (!s) return null;
  const c = s.contenido;
  const columnas = (c.columnas || []) as FooterColumna[];

  return (
    <SectionCard id="footer">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('footer', { titulo: v })}
      />
      <TextareaInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('footer', { subtitulo: v })}
      />
      <TextInput
        label="Copyright"
        value={(c.copyright as string) || ''}
        onChange={(v) => updateContenido('footer', 'copyright', v)}
      />
      <label className="block text-xs font-semibold text-slate-500">
        Columnas del footer ({columnas.length})
      </label>
      {columnas.map((col, ci) => (
        <div key={ci} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <TextInput
              label="Título columna"
              value={col.titulo}
              onChange={(v) => {
                const next = [...columnas];
                next[ci] = { ...next[ci], titulo: v };
                updateContenido('footer', 'columnas', next);
              }}
            />
            <button
              onClick={() => {
                const next = [...columnas];
                next.splice(ci, 1);
                updateContenido('footer', 'columnas', next);
              }}
              className="text-red-500 hover:text-red-700 ml-3"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {col.links.map((link, li) => (
            <div key={li} className="flex items-center gap-2">
              <input
                value={link.texto}
                onChange={(e) => {
                  const next = [...columnas];
                  const links = [...next[ci].links];
                  links[li] = { ...links[li], texto: e.target.value };
                  next[ci] = { ...next[ci], links };
                  updateContenido('footer', 'columnas', next);
                }}
                placeholder="Texto"
                className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm"
              />
              <input
                value={link.url}
                onChange={(e) => {
                  const next = [...columnas];
                  const links = [...next[ci].links];
                  links[li] = { ...links[li], url: e.target.value };
                  next[ci] = { ...next[ci], links };
                  updateContenido('footer', 'columnas', next);
                }}
                placeholder="URL"
                className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm"
              />
              <button
                onClick={() => {
                  const next = [...columnas];
                  const links = [...next[ci].links];
                  links.splice(li, 1);
                  next[ci] = { ...next[ci], links };
                  updateContenido('footer', 'columnas', next);
                }}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const next = [...columnas];
              next[ci] = {
                ...next[ci],
                links: [...next[ci].links, { texto: '', url: '' }],
              };
              updateContenido('footer', 'columnas', next);
            }}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Link
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          updateContenido('footer', 'columnas', [...columnas, { titulo: '', links: [] }])
        }
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar columna
      </button>
    </SectionCard>
  );
}
