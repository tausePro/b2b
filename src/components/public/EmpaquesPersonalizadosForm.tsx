'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Send, Upload, X } from 'lucide-react';
import { readLeadAttributionCookie } from '@/lib/analytics/leadAttribution';
import type { EmpaquesPersonalizadosConfig } from '@/lib/empaques/landing-config-shared';
import {
  EMPAQUES_PERSONALIZADOS_FILE_TYPES,
  EMPAQUES_PERSONALIZADOS_MAX_FILE_BYTES,
  EMPAQUES_PERSONALIZADOS_MAX_FILES,
  EMPAQUES_PERSONALIZADOS_MAX_TOTAL_BYTES,
} from '@/lib/empaques/personalizados-shared';

interface EmpaquesPersonalizadosFormProps {
  config: EmpaquesPersonalizadosConfig;
}

const INITIAL_FORM = {
  nombre: '',
  empresa: '',
  email: '',
  telefono: '',
  tipoEmpaque: '',
  usoProducto: '',
  medidaLargo: '',
  medidaAncho: '',
  medidaAlto: '',
  unidadMedida: 'cm' as 'mm' | 'cm',
  material: '',
  impresion: '',
  cantidad: '',
  ciudadEntrega: '',
  fechaRequerida: '',
  comentarios: '',
  sitioWeb: '',
};

const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20';

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmpaquesPersonalizadosForm({ config }: EmpaquesPersonalizadosFormProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ leadId: string; whatsappUrl: string | null } | null>(null);
  const submittingRef = useRef(false);

  const setField = <K extends keyof typeof INITIAL_FORM>(key: K, value: (typeof INITIAL_FORM)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    setError(null);
    const next = [...files, ...Array.from(selected)];
    if (next.length > EMPAQUES_PERSONALIZADOS_MAX_FILES) {
      setError(`Puedes adjuntar máximo ${EMPAQUES_PERSONALIZADOS_MAX_FILES} archivos.`);
      return;
    }
    if (next.some((file) => !(EMPAQUES_PERSONALIZADOS_FILE_TYPES as readonly string[]).includes(file.type))) {
      setError('Solo se permiten imágenes JPG, PNG, WEBP o archivos PDF.');
      return;
    }
    if (next.some((file) => file.size > EMPAQUES_PERSONALIZADOS_MAX_FILE_BYTES)) {
      setError('Cada archivo debe pesar máximo 3 MB.');
      return;
    }
    if (next.reduce((sum, file) => sum + file.size, 0) > EMPAQUES_PERSONALIZADOS_MAX_TOTAL_BYTES) {
      setError('Los archivos deben pesar máximo 4 MB en total.');
      return;
    }
    setFiles(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!form.email.trim() && !form.telefono.trim()) {
      setError('Ingresa un correo o teléfono de contacto.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const payload = new FormData();
      payload.set('nombre', form.nombre);
      payload.set('empresa', form.empresa);
      payload.set('email', form.email);
      payload.set('telefono', form.telefono);
      payload.set('tipo_empaque', form.tipoEmpaque);
      payload.set('uso_producto', form.usoProducto);
      payload.set('medida_largo', form.medidaLargo);
      payload.set('medida_ancho', form.medidaAncho);
      payload.set('medida_alto', form.medidaAlto);
      payload.set('unidad_medida', form.unidadMedida);
      payload.set('material', form.material);
      payload.set('impresion', form.impresion);
      payload.set('cantidad', form.cantidad);
      payload.set('ciudad_entrega', form.ciudadEntrega);
      payload.set('fecha_requerida', form.fechaRequerida);
      payload.set('comentarios', form.comentarios);
      payload.set('sitio_web', form.sitioWeb);
      payload.set('attribution', JSON.stringify(readLeadAttributionCookie()));
      for (const file of files) payload.append('archivos', file);

      const response = await fetch('/api/empaques/personalizados', {
        method: 'POST',
        body: payload,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar la solicitud.');

      setSuccess({ leadId: data.lead_id, whatsappUrl: data.whatsapp_url || null });
      setForm(INITIAL_FORM);
      setFiles([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar la solicitud.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-green-200 bg-green-50 p-8 text-center" aria-live="polite">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-700" />
        </div>
        <h2 className="mt-5 text-2xl font-black text-slate-950">Solicitud recibida</h2>
        <p className="mt-2 text-base font-semibold leading-7 text-slate-600">
          Guardamos las especificaciones y archivos con la referencia {success.leadId.slice(0, 8)}.
        </p>
        {success.whatsappUrl && (
          <a
            href={success.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#9CBB06] px-7 py-3 font-black text-slate-950 transition hover:bg-[#8cab05]"
          >
            Continuar por WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mx-auto mt-4 block min-h-12 px-4 text-sm font-bold text-slate-500 transition hover:text-slate-900"
        >
          Configurar otro proyecto
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" encType="multipart/form-data">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <fieldset className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">1. Producto y medidas</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Tipo de empaque *</span>
            {config.tipos_empaque.length > 0 ? (
              <select name="tipo_empaque" required value={form.tipoEmpaque} onChange={(event) => setField('tipoEmpaque', event.target.value)} className={inputClass}>
                <option value="">Selecciona una opción</option>
                {config.tipos_empaque.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input name="tipo_empaque" required minLength={2} maxLength={120} value={form.tipoEmpaque} onChange={(event) => setField('tipoEmpaque', event.target.value)} className={inputClass} placeholder="Describe el tipo de empaque" />
            )}
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Cantidad estimada *</span>
            <input name="cantidad" required type="number" min={1} step={1} inputMode="numeric" value={form.cantidad} onChange={(event) => setField('cantidad', event.target.value)} className={inputClass} placeholder="Unidades requeridas" />
          </label>
        </div>
        <label className="block space-y-2">
          <span className="block font-bold text-slate-800">Producto y uso esperado *</span>
          <textarea name="uso_producto" required minLength={2} maxLength={500} rows={4} value={form.usoProducto} onChange={(event) => setField('usoProducto', event.target.value)} className={inputClass} placeholder="Describe qué vas a empacar, peso, presentación y condiciones de uso" />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_120px]">
          {([
            ['medidaLargo', 'Largo'],
            ['medidaAncho', 'Ancho'],
            ['medidaAlto', 'Alto'],
          ] as const).map(([key, label]) => (
            <label key={key} className="space-y-2">
              <span className="block font-bold text-slate-800">{label}</span>
              <input name={key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)} type="number" min="0.01" step="0.01" inputMode="decimal" value={form[key]} onChange={(event) => setField(key, event.target.value)} className={inputClass} />
            </label>
          ))}
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Unidad</span>
            <select name="unidad_medida" value={form.unidadMedida} onChange={(event) => setField('unidadMedida', event.target.value as 'mm' | 'cm')} className={inputClass}>
              <option value="cm">cm</option>
              <option value="mm">mm</option>
            </select>
          </label>
        </div>
        <p className="text-sm font-medium text-slate-500">Si aún no tienes medidas definitivas, puedes dejarlas vacías y explicarlo en comentarios.</p>
      </fieldset>

      <fieldset className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">2. Material e impresión</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Material</span>
            {config.materiales.length > 0 ? (
              <select name="material" value={form.material} onChange={(event) => setField('material', event.target.value)} className={inputClass}>
                <option value="">Por definir con asesor</option>
                {config.materiales.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input name="material" maxLength={120} value={form.material} onChange={(event) => setField('material', event.target.value)} className={inputClass} placeholder="Material deseado o por definir" />
            )}
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Impresión</span>
            {config.impresiones.length > 0 ? (
              <select name="impresion" value={form.impresion} onChange={(event) => setField('impresion', event.target.value)} className={inputClass}>
                <option value="">Por definir con asesor</option>
                {config.impresiones.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input name="impresion" maxLength={120} value={form.impresion} onChange={(event) => setField('impresion', event.target.value)} className={inputClass} placeholder="Describe la impresión requerida" />
            )}
          </label>
        </div>
        <div className="space-y-3">
          <label htmlFor="personalizados-archivos" className="block font-bold text-slate-800">Artes, logos o referencias</label>
          <label htmlFor="personalizados-archivos" className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-[#9CBB06] hover:bg-[#9CBB06]/5">
            <Upload className="h-7 w-7 text-[#9CBB06]" />
            <span className="mt-2 font-black text-slate-800">Seleccionar archivos</span>
            <span className="mt-1 text-sm font-medium text-slate-500">Hasta 3 archivos JPG, PNG, WEBP o PDF; máximo 3 MB cada uno y 4 MB en total.</span>
          </label>
          <input id="personalizados-archivos" name="archivos" type="file" multiple accept={EMPAQUES_PERSONALIZADOS_FILE_TYPES.join(',')} className="sr-only" onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }} />
          {files.length > 0 && (
            <ul className="space-y-2" aria-label="Archivos seleccionados">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 shrink-0 text-[#9CBB06]" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-slate-400">{fileSizeLabel(file.size)}</span>
                  </span>
                  <button type="button" onClick={() => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600" aria-label={`Quitar ${file.name}`}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">3. Entrega y contacto</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Ciudad de entrega</span>
            <input name="ciudad_entrega" maxLength={120} autoComplete="address-level2" value={form.ciudadEntrega} onChange={(event) => setField('ciudadEntrega', event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Fecha requerida</span>
            <input name="fecha_requerida" type="date" value={form.fechaRequerida} onChange={(event) => setField('fechaRequerida', event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Nombre completo *</span>
            <input name="nombre" required minLength={2} maxLength={120} autoComplete="name" value={form.nombre} onChange={(event) => setField('nombre', event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Empresa</span>
            <input name="empresa" maxLength={160} autoComplete="organization" value={form.empresa} onChange={(event) => setField('empresa', event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Correo</span>
            <input name="email" type="email" maxLength={180} autoComplete="email" value={form.email} onChange={(event) => setField('email', event.target.value)} className={inputClass} placeholder="correo@empresa.com" />
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Teléfono</span>
            <input name="telefono" type="tel" maxLength={50} autoComplete="tel" value={form.telefono} onChange={(event) => setField('telefono', event.target.value)} className={inputClass} placeholder="+57 300 000 0000" />
          </label>
        </div>
        <p className="text-sm font-medium text-slate-500">Debes ingresar al menos un correo o teléfono.</p>
        <label className="block space-y-2">
          <span className="block font-bold text-slate-800">Comentarios adicionales</span>
          <textarea name="comentarios" maxLength={2000} rows={5} value={form.comentarios} onChange={(event) => setField('comentarios', event.target.value)} className={inputClass} placeholder="Incluye restricciones, condiciones de almacenamiento u otra información relevante" />
        </label>
        <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          Sitio web
          <input name="sitio_web" tabIndex={-1} autoComplete="off" value={form.sitioWeb} onChange={(event) => setField('sitioWeb', event.target.value)} />
        </label>
      </fieldset>

      <button type="submit" disabled={loading} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#9CBB06] px-8 py-4 text-lg font-black text-slate-950 shadow-lg shadow-[#9CBB06]/20 transition hover:bg-[#8cab05] disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {loading ? 'Enviando solicitud...' : 'Solicitar propuesta personalizada'}
      </button>
    </form>
  );
}
