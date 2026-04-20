'use client';

import { useCmsCtx } from '../../_context';
import { TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

// Editor reutilizable para páginas con texto largo en Markdown
// (Términos y Condiciones, Política de Privacidad).
export function PaginaTextoLargoEditor({ id }: { id: string }) {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones[id];
  if (!s) return null;
  const c = s.contenido;

  return (
    <SectionCard id={id}>
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal(id, { titulo: v })}
      />
      <TextareaInput
        label="Contenido (soporta Markdown)"
        value={(c.cuerpo as string) || ''}
        onChange={(v) => updateContenido(id, 'cuerpo', v)}
        rows={12}
      />
    </SectionCard>
  );
}
