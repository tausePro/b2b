'use client';

import { useCmsCtx } from '../../_context';
import { TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

export function WhatsAppEditor() {
  const { secciones, updateContenido } = useCmsCtx();
  const s = secciones.config_whatsapp;
  if (!s) return null;
  const c = s.contenido;

  return (
    <SectionCard id="config_whatsapp">
      <TextInput
        label="Número WhatsApp (con código país, ej: 573001234567)"
        value={(c.numero as string) || ''}
        onChange={(v) => updateContenido('config_whatsapp', 'numero', v)}
        placeholder="573001234567"
      />
      <TextInput
        label="Texto del botón CTA"
        value={(c.cta_texto as string) || ''}
        onChange={(v) => updateContenido('config_whatsapp', 'cta_texto', v)}
      />
      <TextareaInput
        label="Mensaje por defecto"
        value={(c.mensaje_default as string) || ''}
        onChange={(v) => updateContenido('config_whatsapp', 'mensaje_default', v)}
        rows={2}
      />
    </SectionCard>
  );
}
