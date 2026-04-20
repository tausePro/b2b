'use client';

import { useCmsCtx } from '../../_context';
import { TextInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

export function PaginaContactoEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const id = 'pagina_contacto';
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextInput
          label="Teléfono"
          value={(c.telefono as string) || ''}
          onChange={(v) => updateContenido(id, 'telefono', v)}
        />
        <TextInput
          label="Email"
          value={(c.email as string) || ''}
          onChange={(v) => updateContenido(id, 'email', v)}
        />
        <TextInput
          label="Dirección"
          value={(c.direccion as string) || ''}
          onChange={(v) => updateContenido(id, 'direccion', v)}
        />
        <TextInput
          label="Ciudad"
          value={(c.ciudad as string) || ''}
          onChange={(v) => updateContenido(id, 'ciudad', v)}
        />
        <TextInput
          label="Horario"
          value={(c.horario as string) || ''}
          onChange={(v) => updateContenido(id, 'horario', v)}
        />
        <TextInput
          label="URL Mapa"
          value={(c.mapa_url as string) || ''}
          onChange={(v) => updateContenido(id, 'mapa_url', v)}
        />
      </div>
    </SectionCard>
  );
}
