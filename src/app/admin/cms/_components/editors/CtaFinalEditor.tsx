'use client';

import { useCmsCtx } from '../../_context';
import { TextInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

export function CtaFinalEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.cta;
  if (!s) return null;
  const c = s.contenido;

  return (
    <SectionCard id="cta">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('cta', { titulo: v })}
      />
      <TextInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal('cta', { subtitulo: v })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Texto CTA primario"
          value={(c.cta_primario as string) || ''}
          onChange={(v) => updateContenido('cta', 'cta_primario', v)}
        />
        <TextInput
          label="URL CTA primario"
          value={(c.cta_primario_url as string) || ''}
          onChange={(v) => updateContenido('cta', 'cta_primario_url', v)}
        />
        <TextInput
          label="Texto CTA secundario"
          value={(c.cta_secundario as string) || ''}
          onChange={(v) => updateContenido('cta', 'cta_secundario', v)}
        />
        <TextInput
          label="URL CTA secundario"
          value={(c.cta_secundario_url as string) || ''}
          onChange={(v) => updateContenido('cta', 'cta_secundario_url', v)}
        />
      </div>
    </SectionCard>
  );
}
