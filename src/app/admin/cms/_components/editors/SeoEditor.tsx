'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput, TextareaInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface Faq {
  pregunta: string;
  respuesta: string;
}

export function SeoEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.seo;
  if (!s) {
    return (
      <p className="text-sm text-slate-500">Ejecuta la migración 020 para habilitar SEO.</p>
    );
  }
  const c = s.contenido;
  const org = (c.organization || {}) as Record<string, unknown>;
  const addr = (org.address || {}) as Record<string, string>;
  const faqs = (c.faqs || []) as Faq[];

  return (
    <div className="space-y-4">
      <SectionCard id="seo">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meta Tags</h4>
        <TextInput
          label="Meta Title"
          value={s.titulo || ''}
          onChange={(v) => updateLocal('seo', { titulo: v })}
        />
        <TextareaInput
          label="Meta Description"
          value={s.subtitulo || ''}
          onChange={(v) => updateLocal('seo', { subtitulo: v })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="OG Title"
            value={(c.og_title as string) || ''}
            onChange={(v) => updateContenido('seo', 'og_title', v)}
          />
          <TextInput
            label="OG Description"
            value={(c.og_description as string) || ''}
            onChange={(v) => updateContenido('seo', 'og_description', v)}
          />
        </div>
        <ImageUpload
          label="OG Image"
          currentUrl={(c.og_image as string) || null}
          onUpload={(url) => updateContenido('seo', 'og_image', url || null)}
          folder="seo"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Canonical URL"
            value={(c.canonical_url as string) || ''}
            onChange={(v) => updateContenido('seo', 'canonical_url', v)}
          />
          <TextInput
            label="Robots"
            value={(c.robots as string) || 'index, follow'}
            onChange={(v) => updateContenido('seo', 'robots', v)}
          />
        </div>

        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6">
          Organización (Schema.org)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Nombre empresa"
            value={(org.name as string) || ''}
            onChange={(v) => updateContenido('seo', 'organization', { ...org, name: v })}
          />
          <TextInput
            label="URL sitio web"
            value={(org.url as string) || ''}
            onChange={(v) => updateContenido('seo', 'organization', { ...org, url: v })}
          />
          <TextInput
            label="Teléfono"
            value={(org.telephone as string) || ''}
            onChange={(v) => updateContenido('seo', 'organization', { ...org, telephone: v })}
          />
          <TextInput
            label="Email"
            value={(org.email as string) || ''}
            onChange={(v) => updateContenido('seo', 'organization', { ...org, email: v })}
          />
        </div>
        <ImageUpload
          label="Logo empresa"
          currentUrl={(org.logo as string) || null}
          onUpload={(url) =>
            updateContenido('seo', 'organization', { ...org, logo: url || null })
          }
          folder="brand"
        />

        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">
          Dirección (GEO)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput
            label="Dirección"
            value={addr.streetAddress || ''}
            onChange={(v) =>
              updateContenido('seo', 'organization', {
                ...org,
                address: { ...addr, streetAddress: v },
              })
            }
          />
          <TextInput
            label="Ciudad"
            value={addr.addressLocality || ''}
            onChange={(v) =>
              updateContenido('seo', 'organization', {
                ...org,
                address: { ...addr, addressLocality: v },
              })
            }
          />
          <TextInput
            label="Departamento/Región"
            value={addr.addressRegion || ''}
            onChange={(v) =>
              updateContenido('seo', 'organization', {
                ...org,
                address: { ...addr, addressRegion: v },
              })
            }
          />
          <TextInput
            label="Código postal"
            value={addr.postalCode || ''}
            onChange={(v) =>
              updateContenido('seo', 'organization', {
                ...org,
                address: { ...addr, postalCode: v },
              })
            }
          />
        </div>

        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6">
          FAQs (AEO)
        </h4>
        <p className="text-xs text-slate-400">
          Estas preguntas generan schema FAQPage para buscadores e IAs
        </p>
        {faqs.map((faq, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Pregunta {i + 1}</span>
              <button
                onClick={() => {
                  const next = [...faqs];
                  next.splice(i, 1);
                  updateContenido('seo', 'faqs', next);
                }}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <TextInput
              label="Pregunta"
              value={faq.pregunta}
              onChange={(v) => {
                const next = [...faqs];
                next[i] = { ...next[i], pregunta: v };
                updateContenido('seo', 'faqs', next);
              }}
            />
            <TextareaInput
              label="Respuesta"
              value={faq.respuesta}
              onChange={(v) => {
                const next = [...faqs];
                next[i] = { ...next[i], respuesta: v };
                updateContenido('seo', 'faqs', next);
              }}
              rows={2}
            />
          </div>
        ))}
        <button
          onClick={() =>
            updateContenido('seo', 'faqs', [...faqs, { pregunta: '', respuesta: '' }])
          }
          className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
        >
          <Plus className="w-4 h-4" /> Agregar FAQ
        </button>
      </SectionCard>
    </div>
  );
}
