'use client';

import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

export function PaginaNosotrosEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const id = 'pagina_nosotros';
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
      <TextInput
        label="Subtítulo"
        value={s.subtitulo || ''}
        onChange={(v) => updateLocal(id, { subtitulo: v })}
      />
      <TextareaInput
        label="Contenido principal"
        value={(c.cuerpo as string) || ''}
        onChange={(v) => updateContenido(id, 'cuerpo', v)}
        rows={6}
      />
      <TextareaInput
        label="Misión"
        value={(c.mision as string) || ''}
        onChange={(v) => updateContenido(id, 'mision', v)}
        rows={3}
      />
      <TextareaInput
        label="Visión"
        value={(c.vision as string) || ''}
        onChange={(v) => updateContenido(id, 'vision', v)}
        rows={3}
      />
      <ImageUpload
        label="Imagen"
        currentUrl={s.imagen_url}
        onUpload={(url) => updateLocal(id, { imagen_url: url || null })}
        folder="paginas"
      />
    </SectionCard>
  );
}
