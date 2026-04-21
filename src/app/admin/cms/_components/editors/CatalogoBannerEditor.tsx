'use client';

import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

// Editor del banner de la vista publica /catalogo (estado "browse", sin
// categoria ni busqueda activa). Si no hay imagen_url la landing cae al
// hero de texto por defecto.
export function CatalogoBannerEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.catalogo_banner;
  if (!s) return null;
  const c = s.contenido;
  // Defaults sincronizados con getBanner() en /catalogo/page.tsx: slate-900 al 60%.
  const overlayColor =
    typeof c.overlay_color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(c.overlay_color)
      ? (c.overlay_color.startsWith('#') ? c.overlay_color : `#${c.overlay_color}`)
      : '#0f172a';
  const overlayOpacity =
    typeof c.overlay_opacity === 'number' ? Math.max(0, Math.min(100, c.overlay_opacity)) : 60;

  return (
    <SectionCard id="catalogo_banner">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('catalogo_banner', { titulo: v })}
        placeholder="Ej: Portafolio Imprima"
      />
      <TextareaInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('catalogo_banner', { subtitulo: v })}
        rows={2}
      />
      <div className="grid grid-cols-1 gap-4">
        <TextInput
          label="Texto CTA (opcional)"
          value={(c.cta_texto as string) || ''}
          onChange={(v) => updateContenido('catalogo_banner', 'cta_texto', v)}
          placeholder="Ej: Pedir cotización"
        />
        {/* Este campo prellena el textarea del formulario de leads que se
            abre al hacer click en el CTA. El usuario puede editarlo antes
            de enviar. Luego el sistema redirige al WhatsApp global (el
            mismo de la burbuja flotante) con ese texto ya incluido. */}
        <TextareaInput
          label="Mensaje prellenado para WhatsApp"
          value={(c.mensaje_prefill as string) || ''}
          onChange={(v) => updateContenido('catalogo_banner', 'mensaje_prefill', v)}
          placeholder="Ej: Quiero solicitar una cotización para mi empresa"
          rows={2}
        />
      </div>
      <ImageUpload
        label="Imagen de banner (recomendado ratio 3:1, mínimo 1600×540)"
        currentUrl={s.imagen_url}
        onUpload={(url) => updateLocal('catalogo_banner', { imagen_url: url || null })}
        folder="catalogo-banner"
      />

      {/* Overlay: capa de color sobre la imagen para garantizar contraste
          del texto blanco. El gradiente va del color elegido al transparente
          (izq→der), por eso solo pedimos color base + opacidad. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Overlay sobre la imagen
            </label>
            <p className="text-[11px] text-slate-500">
              Capa de color que oscurece la imagen para dar contraste al texto blanco.
            </p>
          </div>
          <div
            className="h-10 w-16 rounded-lg border border-slate-200 shadow-inner"
            style={{ background: overlayColor, opacity: overlayOpacity / 100 }}
            aria-label="Vista previa del overlay"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={overlayColor}
              onChange={(e) =>
                updateContenido('catalogo_banner', 'overlay_color', e.target.value)
              }
              className="h-10 w-14 rounded-lg border border-slate-200 bg-white cursor-pointer"
              aria-label="Color del overlay"
            />
            <input
              type="text"
              value={overlayColor}
              onChange={(e) =>
                updateContenido('catalogo_banner', 'overlay_color', e.target.value)
              }
              className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
              placeholder="#0f172a"
              maxLength={7}
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span>Opacidad</span>
              <span className="font-mono">{overlayOpacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={overlayOpacity}
              onChange={(e) =>
                updateContenido(
                  'catalogo_banner',
                  'overlay_opacity',
                  Number.parseInt(e.target.value, 10),
                )
              }
              className="w-full accent-primary"
              aria-label="Opacidad del overlay"
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Si no subes una imagen o desactivas la sección, <code className="bg-slate-100 px-1 py-0.5 rounded">/catalogo</code> mostrará el hero de texto por defecto.
      </p>
    </SectionCard>
  );
}
