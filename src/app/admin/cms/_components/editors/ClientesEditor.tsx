'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCmsCtx } from '../../_context';
import { ImageUpload, TextInput } from '../FormControls';
import { SectionCard } from '../SectionCard';

interface ClienteLogo {
  nombre: string;
  logo_url?: string;
}

export function ClientesEditor() {
  const { secciones, updateLocal, updateContenido } = useCmsCtx();
  const s = secciones.clientes;
  if (!s) return null;
  const logos = (s.contenido.logos || []) as ClienteLogo[];

  return (
    <SectionCard id="clientes">
      <TextInput
        label="Título"
        value={s.titulo || ''}
        onChange={(v) => updateLocal('clientes', { titulo: v })}
      />
      <label className="block text-xs font-semibold text-slate-500">Logos ({logos.length})</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {logos.map((logo, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                {logo.nombre || `Logo ${i + 1}`}
              </span>
              <button
                onClick={() => {
                  const next = [...logos];
                  next.splice(i, 1);
                  updateContenido('clientes', 'logos', next);
                }}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <TextInput
              label="Nombre empresa"
              value={logo.nombre}
              onChange={(v) => {
                const next = [...logos];
                next[i] = { ...next[i], nombre: v };
                updateContenido('clientes', 'logos', next);
              }}
            />
            <ImageUpload
              label="Logo"
              currentUrl={logo.logo_url || null}
              onUpload={(url) => {
                const next = [...logos];
                next[i] = { ...next[i], logo_url: url || undefined };
                updateContenido('clientes', 'logos', next);
              }}
              folder="clientes"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => updateContenido('clientes', 'logos', [...logos, { nombre: '' }])}
        className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
      >
        <Plus className="w-4 h-4" /> Agregar logo
      </button>
    </SectionCard>
  );
}
