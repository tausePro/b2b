'use client';

import { Check, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { useCmsCtx } from '../_context';

// Controles de formulario reutilizables por los editores de sección.
// Mantienen idéntico el estilo y comportamiento del editor monolítico original.

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export function TextareaInput({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
      />
    </div>
  );
}

export function ImageUpload({
  label,
  currentUrl,
  onUpload,
  folder,
}: {
  label: string;
  currentUrl: string | null;
  onUpload: (url: string) => void;
  folder: string;
}) {
  const { subirImagen } = useCmsCtx();
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {currentUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={label}
            className="w-16 h-16 object-contain rounded-lg border border-border bg-slate-50"
          />
        )}
        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <Upload className="w-4 h-4" />
          {currentUrl ? 'Cambiar' : 'Subir imagen'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = await subirImagen(file, folder);
              if (url) onUpload(url);
            }}
          />
        </label>
        {currentUrl && (
          <button onClick={() => onUpload('')} className="text-red-500 hover:text-red-700 text-xs">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SaveButton({ id }: { id: string }) {
  const { saving, saved, guardarSeccion } = useCmsCtx();
  const isSaving = saving === id;
  const isSaved = saved === id;
  return (
    <button
      onClick={() => void guardarSeccion(id)}
      disabled={isSaving}
      className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-slate-900 font-bold text-sm px-5 py-2.5 rounded-lg transition-all disabled:opacity-50"
    >
      {isSaving ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isSaved ? (
        <Check className="w-4 h-4" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {isSaving ? 'Guardando...' : isSaved ? 'Guardado' : 'Guardar'}
    </button>
  );
}

export function ActiveToggle({ id }: { id: string }) {
  const { secciones, updateLocal } = useCmsCtx();
  const sec = secciones[id];
  if (!sec) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        updateLocal(id, { activo: !sec.activo });
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        sec.activo ? 'bg-primary' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          sec.activo ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
