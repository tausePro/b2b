'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

// Tipos locales de los items JSONB del hero. Mantener sincronizado con la
// migracion 034 y con src/components/public/HeroHome.tsx.
interface StatItem {
  label: string;
  valor: string;
  suffix?: string;
  dinamico?: string;
}

interface ChipItem {
  texto: string;
  icono?: string;
}

// Lista de fuentes dinamicas soportadas por el front. El admin elige
// desde un select para evitar typos; si elige "Sin fuente dinamica", el
// front usa el valor manual tal cual.
const DINAMICOS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Sin fuente dinámica (usar valor manual)' },
  { value: 'productos_total', label: 'Total de productos del catálogo' },
  { value: 'categorias_total', label: 'Total de categorías del catálogo' },
];

export function HeroEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.hero;
  if (!s) return null;
  const c = s.contenido;
  const stats = (c.stats_items as StatItem[] | undefined) || [];
  const chips = (c.chips_items as ChipItem[] | undefined) || [];

  return (
    <SectionCard id="hero">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('hero', { titulo: v })}
      />
      <TextareaInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('hero', { subtitulo: v })}
      />
      <TextInput
        label="Badge"
        value={(c.badge as string) || ''}
        onChange={(v) => updateContenido('hero', 'badge', v)}
        placeholder="Ej: Soluciones Corporativas 2025"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Texto CTA primario"
          value={(c.cta_primario as string) || ''}
          onChange={(v) => updateContenido('hero', 'cta_primario', v)}
        />
        <TextInput
          label="URL CTA primario"
          value={(c.cta_primario_url as string) || ''}
          onChange={(v) => updateContenido('hero', 'cta_primario_url', v)}
        />
        <TextInput
          label="Texto CTA secundario"
          value={(c.cta_secundario as string) || ''}
          onChange={(v) => updateContenido('hero', 'cta_secundario', v)}
        />
        <TextInput
          label="URL CTA secundario"
          value={(c.cta_secundario_url as string) || ''}
          onChange={(v) => updateContenido('hero', 'cta_secundario_url', v)}
        />
      </div>
      <ImageUpload
        label="Imagen Hero (formato ancho recomendado, min 1600px de ancho)"
        currentUrl={s.imagen_url}
        onUpload={(url) => updateLocal('hero', { imagen_url: url || null })}
        folder="hero"
      />

      {/* Tarjeta glass flotante que se dibuja encima de la imagen del hero.
          Si ambos campos estan vacios, la tarjeta no se renderiza en el front. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Tarjeta glass sobre la imagen
          </label>
          <p className="text-[11px] text-slate-500">
            Dato destacado que flota sobre la imagen del hero (ej: “+500 empresas confían”).
            Déjala vacía para no mostrar la tarjeta.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput
            label="Titular"
            value={(c.glass_card_titulo as string) || ''}
            onChange={(v) => updateContenido('hero', 'glass_card_titulo', v)}
            placeholder="Ej: +500 empresas confían"
          />
          <TextInput
            label="Subtitular"
            value={(c.glass_card_subtitulo as string) || ''}
            onChange={(v) => updateContenido('hero', 'glass_card_subtitulo', v)}
            placeholder="Ej: en nuestro modelo B2B"
          />
        </div>
      </div>

      {/* Barra de indicadores (stats) debajo del hero. Cada item admite un
          modo `dinamico` que reemplaza el valor manual por un conteo real
          de Odoo (productos activos, categorias, etc.). */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Indicadores del hero ({stats.length})
            </label>
            <p className="text-[11px] text-slate-500">
              Barra de stats debajo del hero. Recomendado 4 items (queda en
              grilla 2×2 en móvil, 4 columnas en desktop).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateContenido('hero', 'stats_items', [
                ...stats,
                { label: '', valor: '', suffix: '', dinamico: '' },
              ])
            }
            className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>

        {stats.map((item, i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                {item.label || `Indicador ${i + 1}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = [...stats];
                  next.splice(i, 1);
                  updateContenido('hero', 'stats_items', next);
                }}
                className="text-red-500 hover:text-red-700"
                aria-label="Eliminar indicador"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <TextInput
                label="Etiqueta"
                value={item.label}
                onChange={(v) => {
                  const next = [...stats];
                  next[i] = { ...next[i], label: v };
                  updateContenido('hero', 'stats_items', next);
                }}
                placeholder="Ej: Empresas atendidas"
              />
              <TextInput
                label="Valor manual"
                value={item.valor}
                onChange={(v) => {
                  const next = [...stats];
                  next[i] = { ...next[i], valor: v };
                  updateContenido('hero', 'stats_items', next);
                }}
                placeholder="Ej: 500"
              />
              <TextInput
                label="Sufijo"
                value={item.suffix || ''}
                onChange={(v) => {
                  const next = [...stats];
                  next[i] = { ...next[i], suffix: v };
                  updateContenido('hero', 'stats_items', next);
                }}
                placeholder="Ej: +  ·  24h  ·  %"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Fuente dinámica (opcional)
              </label>
              <select
                value={item.dinamico || ''}
                onChange={(e) => {
                  const next = [...stats];
                  next[i] = { ...next[i], dinamico: e.target.value };
                  updateContenido('hero', 'stats_items', next);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {DINAMICOS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Chips de propuesta de valor junto a los CTAs. Textos cortos tipo
          "Crédito empresarial" / "Asesor dedicado" que refuerzan diferenciales. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Chips de propuesta de valor ({chips.length})
            </label>
            <p className="text-[11px] text-slate-500">
              Textos cortos que aparecen bajo los CTAs del hero. Recomendado
              3–5 items; cada texto 2–4 palabras.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateContenido('hero', 'chips_items', [...chips, { texto: '' }])
            }
            className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
        {chips.map((chip, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1">
              <TextInput
                label={`Chip ${i + 1}`}
                value={chip.texto}
                onChange={(v) => {
                  const next = [...chips];
                  next[i] = { ...next[i], texto: v };
                  updateContenido('hero', 'chips_items', next);
                }}
                placeholder="Ej: Crédito empresarial"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const next = [...chips];
                next.splice(i, 1);
                updateContenido('hero', 'chips_items', next);
              }}
              className="mt-5 text-red-500 hover:text-red-700"
              aria-label="Eliminar chip"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
