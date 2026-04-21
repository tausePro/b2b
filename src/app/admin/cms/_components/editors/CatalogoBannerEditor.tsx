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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Texto CTA (opcional)"
          value={(c.cta_texto as string) || ''}
          onChange={(v) => updateContenido('catalogo_banner', 'cta_texto', v)}
          placeholder="Ej: Pedir cotización"
        />
        <TextInput
          label="URL CTA (opcional)"
          value={(c.cta_url as string) || ''}
          onChange={(v) => updateContenido('catalogo_banner', 'cta_url', v)}
          placeholder="Ej: /login o https://..."
        />
      </div>
      <ImageUpload
        label="Imagen de banner (recomendado ratio 3:1, mínimo 1600×540)"
        currentUrl={s.imagen_url}
        onUpload={(url) => updateLocal('catalogo_banner', { imagen_url: url || null })}
        folder="catalogo-banner"
      />
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Si no subes una imagen o desactivas la sección, <code className="bg-slate-100 px-1 py-0.5 rounded">/catalogo</code> mostrará el hero de texto por defecto.
      </p>
    </SectionCard>
  );
}
