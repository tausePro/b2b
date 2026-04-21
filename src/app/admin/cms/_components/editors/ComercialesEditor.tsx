'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

// Editor CMS del equipo comercial que se muestra en /contacto como grilla
// de tarjetas. Guarda el array en landing_contenido/contacto_comerciales
// bajo contenido.comerciales.
//
// Cada item usa `id` como slug estable: se propaga al lead como
// `contacto_comercial_<id>` para poder filtrar en /admin/leads por
// comercial. Si el admin deja `id` vacio, generamos uno desde `nombre`
// (normalizado) al guardar — pero lo dejamos editable para que el admin
// pueda renombrar a alguien sin perder el slug historico.
//
// Sanitizacion:
//   - telefono: se muestra tal cual (el admin lo puede escribir con
//     formato), el backend lo sanitiza a solo digitos para wa.me.
//   - foto_url: solo imagen cuadrada (recomendado 1:1), se centra con
//     object-cover en el front.

interface Comercial {
  id: string;
  nombre: string;
  cargo: string;
  foto_url: string | null;
  telefono: string;
  email: string;
  mensaje_prefill: string;
}

// Convierte un nombre a slug ascii simple para poblar id por defecto.
// No pretende ser perfecto; si el admin necesita algo distinto lo edita
// a mano en el input.
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function ComercialesEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const id = 'contacto_comerciales';
  const s = secciones[id];
  if (!s) return null;
  const items = (s.contenido.comerciales || []) as Comercial[];

  const updateItem = (i: number, patch: Partial<Comercial>) => {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    updateContenido(id, 'comerciales', next);
  };

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

      <div className="flex items-center justify-between gap-3 pt-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Comerciales ({items.length})
          </label>
          <p className="text-[11px] text-slate-500">
            Cada tarjeta aparece en la página de contacto con foto, nombre,
            teléfono y email. El botón de WhatsApp redirige al número de la
            comercial con el mensaje pre-llenado.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            updateContenido(id, 'comerciales', [
              ...items,
              {
                id: '',
                nombre: '',
                cargo: '',
                foto_url: null,
                telefono: '',
                email: '',
                mensaje_prefill: 'Hola, quiero información sobre...',
              },
            ])
          }
          className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
        >
          <Plus className="w-4 h-4" /> Agregar comercial
        </button>
      </div>

      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {item.nombre || `Comercial ${i + 1}`}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                updateContenido(id, 'comerciales', next);
              }}
              className="text-red-500 hover:text-red-700"
              aria-label="Eliminar comercial"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            {/* Foto: columna fija para que se vea como preview real */}
            <div>
              <ImageUpload
                label="Foto"
                currentUrl={item.foto_url}
                onUpload={(url) => updateItem(i, { foto_url: url || null })}
                folder={`comerciales/${item.id || slugify(item.nombre) || 'nuevo'}`}
              />
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Nombre"
                  value={item.nombre}
                  onChange={(v) => {
                    // Si el admin nunca tocó el id y el nombre esta vacio,
                    // autopoblamos id con un slug a partir del nombre. Una
                    // vez el id tiene valor, no lo sobreescribimos para no
                    // perder trazabilidad de leads historicos.
                    const shouldAutoId = !item.id;
                    updateItem(i, {
                      nombre: v,
                      ...(shouldAutoId ? { id: slugify(v) } : {}),
                    });
                  }}
                  placeholder="Ej: Diana M. Caicedo"
                />
                <TextInput
                  label="Cargo"
                  value={item.cargo}
                  onChange={(v) => updateItem(i, { cargo: v })}
                  placeholder="Ej: Asesora comercial"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextInput
                  label="Teléfono / WhatsApp"
                  value={item.telefono}
                  onChange={(v) => updateItem(i, { telefono: v })}
                  placeholder="Ej: +57 316 881 9494"
                />
                <TextInput
                  label="Email"
                  value={item.email}
                  onChange={(v) => updateItem(i, { email: v })}
                  placeholder="Ej: diana.caicedo@imprima.com.co"
                />
              </div>
              <TextareaInput
                label="Mensaje WhatsApp pre-llenado"
                value={item.mensaje_prefill}
                onChange={(v) => updateItem(i, { mensaje_prefill: v })}
                rows={2}
                placeholder="Ej: Hola Diana, quiero solicitar una cotización..."
              />
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Slug (identificador de la fuente del lead)
                </label>
                <input
                  type="text"
                  value={item.id}
                  onChange={(e) => updateItem(i, { id: slugify(e.target.value) })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                  placeholder="Ej: diana"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se usa en el tracking del lead como{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded">
                    contacto_comercial_{item.id || 'slug'}
                  </code>
                  . Solo minúsculas, números y guión bajo.
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}

    </SectionCard>
  );
}
