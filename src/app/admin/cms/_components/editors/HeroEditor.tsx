'use client';

import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

export function HeroEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.hero;
  if (!s) return null;
  const c = s.contenido;

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
        label="Imagen Hero"
        currentUrl={s.imagen_url}
        onUpload={(url) => updateLocal('hero', { imagen_url: url || null })}
        folder="hero"
      />
    </SectionCard>
  );
}
