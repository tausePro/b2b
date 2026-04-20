'use client';

import { useEffect, useState } from 'react';
import { Link2Off, Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

// Nuevo shape: el admin selecciona una categoría real del catálogo y solo
// aporta imagen + descripción opcional. El título se toma de Odoo al render.
//
// Los items antiguos (sin `categoria_id`) siguen funcionando como texto libre
// para no romper contenido ya guardado: se editan en modo "legacy" y se pueden
// migrar vinculándolos a una categoría.
interface CategoriaItem {
  categoria_id?: number;
  imagen_url: string | null;
  descripcion?: string;
  // Legacy (si no hay categoria_id):
  titulo?: string;
  icono?: string;
}

interface CategoriaDisponible {
  id: number;
  name: string;
  complete_name: string;
  slug: string;
}

export function CategoriasEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.categorias;
  const items = (s?.contenido.items || []) as CategoriaItem[];

  const [disponibles, setDisponibles] = useState<CategoriaDisponible[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Carga única del listado de categorías disponibles desde Odoo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/cms/categorias-disponibles');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error cargando categorías');
        if (!cancelled) setDisponibles(data.categorias || []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Error cargando categorías');
        }
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!s) return null;

  // IDs ya vinculados en items para evitar duplicados y mostrar nombre.
  const catById = new Map<number, CategoriaDisponible>(disponibles.map((c) => [c.id, c]));
  const idsEnUso = new Set(
    items.map((it) => it.categoria_id).filter((x): x is number => typeof x === 'number'),
  );

  const actualizarItem = (i: number, patch: Partial<CategoriaItem>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    updateContenido('categorias', 'items', next);
  };

  const eliminarItem = (i: number) => {
    const next = [...items];
    next.splice(i, 1);
    updateContenido('categorias', 'items', next);
  };

  const agregarItem = () => {
    updateContenido('categorias', 'items', [
      ...items,
      { categoria_id: undefined, imagen_url: null, descripcion: '' },
    ]);
  };

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

      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-500">
          Categorías a mostrar ({items.length})
        </label>
        {loadingCats && (
          <span className="text-xs text-slate-400">Cargando catálogo…</span>
        )}
      </div>
      {loadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {loadError}
        </p>
      )}

      {items.map((item, i) => {
        const esLegacy =
          typeof item.categoria_id !== 'number' && (item.titulo || item.icono);
        const catVinculada =
          typeof item.categoria_id === 'number' ? catById.get(item.categoria_id) : null;

        return (
          <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                Tarjeta {i + 1}
                {esLegacy && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold"
                    title="Este item se creó antes de vincular categorías reales. Vincúlalo a una categoría del catálogo."
                  >
                    <Link2Off className="w-3 h-3" /> Legacy
                  </span>
                )}
              </span>
              <button
                onClick={() => eliminarItem(i)}
                className="text-red-500 hover:text-red-700"
                title="Eliminar tarjeta"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Selector de categoría real */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Categoría del catálogo
              </label>
              <select
                value={item.categoria_id ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  actualizarItem(i, {
                    categoria_id: v ? Number(v) : undefined,
                    // Al vincular, limpiamos campos legacy para evitar confusión.
                    ...(v ? { titulo: undefined, icono: undefined } : {}),
                  });
                }}
                disabled={loadingCats}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white disabled:opacity-50"
              >
                <option value="">— Sin vincular —</option>
                {disponibles.map((cat) => {
                  const enUsoPorOtro =
                    idsEnUso.has(cat.id) && item.categoria_id !== cat.id;
                  return (
                    <option key={cat.id} value={cat.id} disabled={enUsoPorOtro}>
                      {cat.name}
                      {enUsoPorOtro ? ' (ya en uso)' : ''}
                    </option>
                  );
                })}
              </select>
              {catVinculada && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Enlazará a <code className="bg-white px-1 py-0.5 rounded border">
                    /catalogo?categoria={catVinculada.id}
                  </code>
                </p>
              )}
            </div>

            {/* Modo legacy: mantenemos los campos para que el admin pueda migrar */}
            {esLegacy && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <TextInput
                  label="Título (legacy)"
                  value={item.titulo || ''}
                  onChange={(v) => actualizarItem(i, { titulo: v })}
                />
                <TextInput
                  label="Ícono (legacy)"
                  value={item.icono || ''}
                  onChange={(v) => actualizarItem(i, { icono: v })}
                />
              </div>
            )}

            <TextareaInput
              label="Descripción (opcional, sobrescribe la de Odoo)"
              value={item.descripcion || ''}
              onChange={(v) => actualizarItem(i, { descripcion: v })}
              rows={2}
            />
            <ImageUpload
              label="Imagen"
              currentUrl={item.imagen_url}
              onUpload={(url) => actualizarItem(i, { imagen_url: url || null })}
              folder="categorias"
            />
          </div>
        );
      })}

      <button
        onClick={agregarItem}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar tarjeta
      </button>
    </SectionCard>
  );
}
