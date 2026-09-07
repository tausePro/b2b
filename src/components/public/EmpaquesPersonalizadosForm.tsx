'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { CheckCircle2, FileText, Loader2, Send, Upload, X } from 'lucide-react';
import { readLeadAttributionCookie } from '@/lib/analytics/leadAttribution';
import type { EmpaquesPersonalizadosConfig } from '@/lib/empaques/landing-config-shared';
import {
  EMPAQUES_MIN_PPP,
  EMPAQUES_RECOMMENDED_PPP,
  EMPAQUES_TIFF_MAX_BYTES,
  getEmpaquesCaras,
  getEmpaquesImpresionSku,
  type EmpaquesArteListo,
  type EmpaquesArteValidacion,
  type EmpaquesCara,
  type EmpaquesModalidad,
} from '@/lib/empaques/personalizados-shared';

interface EmpaquesPersonalizadosFormProps {
  config: EmpaquesPersonalizadosConfig;
}

type EstadoArte =
  | { estado: 'iniciando' | 'subiendo' | 'validando'; nombre: string; tamano: number; progreso: number }
  | { estado: 'validado'; arte: EmpaquesArteListo }
  | { estado: 'error' | 'expirado'; nombre: string; mensaje: string };

type ArtesPorCara = Partial<Record<EmpaquesCara, EstadoArte>>;
type NodoSubida = { controller: AbortController; xhr: XMLHttpRequest | null };

const INITIAL_FORM = {
  sku: '',
  modalidad: 'produccion' as EmpaquesModalidad,
  caras: 1 as 1 | 2,
  nombre: '',
  empresa: '',
  email: '',
  telefono: '',
  usoProducto: '',
  cantidad: '',
  ciudadEntrega: '',
  fechaRequerida: '',
  comentarios: '',
  sitioWeb: '',
};

const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20';
const ARCHIVOS_API = '/api/empaques/personalizados/archivos';
const EXPIRADO_MESSAGE = 'El archivo o su vista previa venció. Vuelve a subir el TIFF de esta cara antes de enviar.';

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function vigente(expiresAt: string) {
  return Date.parse(expiresAt) > Date.now();
}

function esUrlSegura(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function esValidacion(value: unknown): value is EmpaquesArteValidacion {
  if (!value || typeof value !== 'object') return false;
  const validation = value as Record<string, unknown>;
  return ['ancho_px', 'alto_px'].every((key) => typeof validation[key] === 'number' && Number.isSafeInteger(validation[key]) && validation[key] > 0)
    && ['ppp_efectivos', 'ancho_impresion_cm', 'alto_impresion_cm'].every((key) => typeof validation[key] === 'number' && Number.isFinite(validation[key]) && validation[key] > 0)
    && typeof validation.ppp_efectivos === 'number' && validation.ppp_efectivos >= EMPAQUES_MIN_PPP
    && typeof validation.proporcion_diferente === 'boolean'
    && typeof validation.resolucion_recomendada === 'boolean';
}

async function leerRespuesta(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('El servicio no devolvió una respuesta válida. Intenta nuevamente.');
  }
  return data as Record<string, unknown>;
}

function subirTiff(url: string, file: File, nodo: NodoSubida, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    nodo.xhr = xhr;
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      nodo.controller.signal.removeEventListener('abort', abort);
      xhr.upload.onprogress = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.onabort = null;
      xhr.ontimeout = null;
      nodo.xhr = null;
      if (error) reject(error);
      else resolve();
    };
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'image/tiff');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded * 100 / event.total)));
    };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error('No se pudo subir el TIFF. Selecciónalo nuevamente para reintentar.'));
    xhr.onerror = () => finish(new Error('Se interrumpió la conexión durante la subida. Vuelve a seleccionar el TIFF.'));
    xhr.onabort = () => finish(new DOMException('Subida cancelada', 'AbortError'));
    xhr.ontimeout = () => finish(new Error('La subida tardó demasiado. Revisa tu conexión y vuelve a seleccionar el TIFF.'));
    nodo.controller.signal.addEventListener('abort', abort, { once: true });
    if (nodo.controller.signal.aborted) {
      finish(new DOMException('Subida cancelada', 'AbortError'));
      return;
    }
    try {
      xhr.send(file);
    } catch (error) {
      finish(error instanceof Error ? error : new Error('No se pudo iniciar la subida.'));
    }
  });
}

export default function EmpaquesPersonalizadosForm({ config }: EmpaquesPersonalizadosFormProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [artes, setArtes] = useState<ArtesPorCara>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ leadId: string; whatsappUrl: string | null } | null>(null);
  const artesRef = useRef<ArtesPorCara>({});
  const subidasRef = useRef<Partial<Record<EmpaquesCara, NodoSubida>>>({});
  const submittingRef = useRef(false);
  const envioRef = useRef<AbortController | null>(null);
  const intentoRef = useRef<{ id: string; payload: string } | null>(null);
  const referencias = config.referencias.filter((referencia) => referencia.activo);
  const referencia = referencias.find((item) => item.sku === form.sku);
  const caras = getEmpaquesCaras(form.caras);
  const impresionSku = getEmpaquesImpresionSku(form.modalidad, form.caras);
  const artesListos = Boolean(referencia) && caras.every((cara) => artes[cara]?.estado === 'validado');

  useEffect(() => {
    const subidas = subidasRef.current;
    return () => {
      for (const nodo of Object.values(subidas)) nodo?.controller.abort();
      envioRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const listos = Object.values(artes).filter((arte) => arte?.estado === 'validado');
    if (!listos.length) return;
    const nextExpiry = Math.min(...listos.map((estado) => Date.parse(estado.arte.expires_at)));
    const timeout = window.setTimeout(() => {
      let changed = false;
      const next = { ...artesRef.current };
      for (const cara of getEmpaquesCaras(2)) {
        const estado = next[cara];
        if (estado?.estado === 'validado' && !vigente(estado.arte.expires_at)) {
          next[cara] = { estado: 'expirado', nombre: estado.arte.nombre, mensaje: EXPIRADO_MESSAGE };
          changed = true;
        }
      }
      if (changed) {
        artesRef.current = next;
        setArtes(next);
      }
    }, Math.min(2_147_483_647, Math.max(0, nextExpiry - Date.now())));
    return () => window.clearTimeout(timeout);
  }, [artes]);

  const actualizarArte = (cara: EmpaquesCara, estado?: EstadoArte) => {
    const next = { ...artesRef.current };
    if (estado) next[cara] = estado;
    else delete next[cara];
    artesRef.current = next;
    setArtes(next);
  };

  const cancelarSubida = (cara: EmpaquesCara) => {
    const nodo = subidasRef.current[cara];
    delete subidasRef.current[cara];
    nodo?.controller.abort();
  };

  const descartarArtes = () => {
    for (const cara of getEmpaquesCaras(2)) cancelarSubida(cara);
    artesRef.current = {};
    setArtes({});
  };

  const setField = <K extends keyof typeof INITIAL_FORM>(key: K, value: (typeof INITIAL_FORM)[K]) => {
    if (submittingRef.current || form[key] === value) return;
    intentoRef.current = null;
    setError(null);
    if (key === 'sku' || key === 'caras') descartarArtes();
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleFile = async (cara: EmpaquesCara, file: File | undefined) => {
    if (submittingRef.current || !file || !referencia || !caras.includes(cara)) return;
    cancelarSubida(cara);
    intentoRef.current = null;
    setError(null);
    actualizarArte(cara, { estado: 'iniciando', nombre: file.name, tamano: file.size, progreso: 0 });
    if (!/\.tiff?$/i.test(file.name) || !['', 'image/tiff', 'image/x-tiff'].includes(file.type.toLowerCase())) {
      actualizarArte(cara, { estado: 'error', nombre: file.name, mensaje: 'Selecciona un archivo .tif o .tiff. El servidor comprobará que sea un TIFF real.' });
      return;
    }
    if (!file.size || file.size > EMPAQUES_TIFF_MAX_BYTES) {
      actualizarArte(cara, { estado: 'error', nombre: file.name, mensaje: `El TIFF no puede estar vacío ni superar ${fileSizeLabel(EMPAQUES_TIFF_MAX_BYTES)}.` });
      return;
    }

    const sku = referencia.sku;
    const nodo: NodoSubida = { controller: new AbortController(), xhr: null };
    subidasRef.current[cara] = nodo;
    const actual = () => subidasRef.current[cara] === nodo && !nodo.controller.signal.aborted;
    const progress = (estado: 'subiendo' | 'validando', progreso: number) => {
      if (actual()) actualizarArte(cara, { estado, nombre: file.name, tamano: file.size, progreso });
    };

    try {
      const inicioResponse = await fetch(ARCHIVOS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'iniciar', sku, cara, nombre: file.name, tamano: file.size }),
        signal: nodo.controller.signal,
      });
      const inicio = await leerRespuesta(inicioResponse);
      if (!actual()) return;
      if (!inicioResponse.ok) throw new Error(typeof inicio.error === 'string' ? inicio.error : 'No se pudo preparar la subida.');
      if (typeof inicio.id !== 'string' || !inicio.id || typeof inicio.token !== 'string' || !inicio.token
        || !esUrlSegura(inicio.upload_url) || typeof inicio.expires_at !== 'string' || !vigente(inicio.expires_at)) {
        throw new Error('La autorización de subida no es válida o ya venció. Selecciona nuevamente el TIFF.');
      }
      progress('subiendo', 0);
      await subirTiff(inicio.upload_url, file, nodo, (value) => progress('subiendo', value));
      if (!actual()) return;
      progress('validando', 100);
      const validacionResponse = await fetch(ARCHIVOS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validar', id: inicio.id, token: inicio.token }),
        signal: nodo.controller.signal,
      });
      const data = await leerRespuesta(validacionResponse);
      if (!actual()) return;
      if (!validacionResponse.ok) throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo validar el TIFF.');
      if (data.id !== inicio.id || data.sku !== sku || data.cara !== cara || typeof data.nombre !== 'string'
        || data.tamano !== file.size || !esUrlSegura(data.preview_url) || typeof data.expires_at !== 'string'
        || !esValidacion(data.validacion)) {
        throw new Error('La validación recibida no corresponde a este archivo y cara. Vuelve a subir el TIFF.');
      }
      if (!vigente(data.expires_at)) {
        actualizarArte(cara, { estado: 'expirado', nombre: file.name, mensaje: EXPIRADO_MESSAGE });
        return;
      }
      actualizarArte(cara, {
        estado: 'validado',
        arte: {
          id: inicio.id,
          token: inicio.token,
          sku,
          cara,
          nombre: data.nombre,
          tamano: file.size,
          preview_url: data.preview_url,
          expires_at: data.expires_at,
          validacion: data.validacion,
        },
      });
    } catch (uploadError) {
      if (actual()) actualizarArte(cara, { estado: 'error', nombre: file.name, mensaje: uploadError instanceof Error ? uploadError.message : 'No se pudo validar el TIFF. Selecciónalo nuevamente.' });
    } finally {
      if (subidasRef.current[cara] === nodo) delete subidasRef.current[cara];
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!referencia || !config.activo) {
      setError('Selecciona una referencia de bolsa disponible.');
      return;
    }
    const cantidad = Number(form.cantidad);
    if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 10_000_000) {
      setError('Ingresa una cantidad entera entre 1 y 10.000.000.');
      return;
    }
    if (form.nombre.trim().length < 2 || form.usoProducto.trim().length < 2) {
      setError('Completa tu nombre y el uso del producto.');
      return;
    }
    if (!form.email.trim() && !form.telefono.trim()) {
      setError('Ingresa un correo o teléfono de contacto.');
      return;
    }
    const archivos: Pick<EmpaquesArteListo, 'id' | 'token' | 'cara'>[] = [];
    for (const cara of caras) {
      const estado = artesRef.current[cara];
      if (estado?.estado !== 'validado' || estado.arte.sku !== form.sku || estado.arte.cara !== cara || subidasRef.current[cara]) {
        setError(`Sube y espera la validación del TIFF de ${cara} antes de enviar.`);
        return;
      }
      if (!vigente(estado.arte.expires_at)) {
        actualizarArte(cara, { estado: 'expirado', nombre: estado.arte.nombre, mensaje: EXPIRADO_MESSAGE });
        setError(`Vuelve a subir el TIFF de ${cara}: su validación venció.`);
        return;
      }
      archivos.push({ id: estado.arte.id, token: estado.arte.token, cara });
    }
    if (new Set(archivos.map((archivo) => archivo.id)).size !== caras.length) {
      setError('Cada cara necesita su propio archivo subido y validado.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    envioRef.current = controller;

    try {
      const payload = {
        sku: form.sku,
        modalidad: form.modalidad,
        caras: form.caras,
        cantidad,
        uso_producto: form.usoProducto,
        nombre: form.nombre,
        empresa: form.empresa,
        email: form.email,
        telefono: form.telefono,
        ciudad_entrega: form.ciudadEntrega,
        fecha_requerida: form.fechaRequerida,
        comentarios: form.comentarios,
        sitio_web: form.sitioWeb,
        attribution: readLeadAttributionCookie(),
        archivos,
      };
      const serialized = JSON.stringify(payload);
      if (!intentoRef.current || intentoRef.current.payload !== serialized) {
        intentoRef.current = { id: crypto.randomUUID(), payload: serialized };
      }
      const response = await fetch('/api/empaques/personalizados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solicitud_id: intentoRef.current.id, ...payload }),
        signal: controller.signal,
      });
      const data = await leerRespuesta(response);
      if (controller.signal.aborted) return;
      if (!response.ok || data.ok !== true) {
        const message = typeof data.error === 'string' ? data.error : 'No se pudo enviar la solicitud.';
        if (response.status === 410 || /expir|vencid|caduc|preview|vista previa|previsual/i.test(`${data.code || ''} ${message}`)) {
          for (const cara of caras) {
            const estado = artesRef.current[cara];
            if (estado?.estado === 'validado') actualizarArte(cara, { estado: 'expirado', nombre: estado.arte.nombre, mensaje: EXPIRADO_MESSAGE });
          }
          throw new Error(`${message} Vuelve a subir los TIFF indicados antes de enviar.`);
        }
        if (response.status === 409) {
          throw new Error(`${message} La solicitud o alguno de estos artes puede haber sido enviado. Revisa la confirmación o consulta con nuestro equipo antes de crear otra solicitud para evitar duplicados.`);
        }
        throw new Error(message);
      }
      if (typeof data.lead_id !== 'string' || !data.lead_id) throw new Error('No recibimos la referencia de confirmación. Reintenta sin cambiar los datos para consultar el mismo envío.');
      setSuccess({ leadId: data.lead_id, whatsappUrl: esUrlSegura(data.whatsapp_url) ? data.whatsapp_url : null });
      setForm(INITIAL_FORM);
      descartarArtes();
      intentoRef.current = null;
    } catch (submitError) {
      if (!controller.signal.aborted) setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar la solicitud. Reintenta sin cambiar los datos.');
    } finally {
      if (!controller.signal.aborted) {
        submittingRef.current = false;
        setLoading(false);
      }
      if (envioRef.current === controller) envioRef.current = null;
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

  if (!config.activo || referencias.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7" role="status">
        <h2 className="text-xl font-black text-slate-950">Configurador temporalmente indisponible</h2>
        <p className="font-semibold leading-7 text-slate-600">No hay referencias de bolsas habilitadas en este momento. Intenta nuevamente más tarde.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" aria-busy={loading}>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <fieldset disabled={loading} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">1. Selecciona tu bolsa kraft</legend>
        <label className="block space-y-2">
          <span className="block font-bold text-slate-800">Referencia de bolsa *</span>
          <select name="sku" required value={form.sku} onChange={(event) => setField('sku', event.target.value)} className={inputClass}>
            <option value="">Selecciona una referencia</option>
            {referencias.map((item) => <option key={item.sku} value={item.sku}>{item.nombre} · {item.sku}</option>)}
          </select>
        </label>
        {referencia && (
          <p className="text-sm font-semibold leading-6 text-slate-600">Área fija de impresión por cara: {referencia.ancho_cm} cm de ancho × {referencia.alto_cm} cm de alto. Estas medidas corresponden al área de impresión, no a las dimensiones de la bolsa.</p>
        )}
      </fieldset>

      <fieldset disabled={loading || !referencia} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">2. Modalidad e impresión CMYK</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Modalidad *</span>
            <select name="modalidad" value={form.modalidad} onChange={(event) => setField('modalidad', event.target.value as EmpaquesModalidad)} className={inputClass}>
              <option value="produccion">Producción</option>
              <option value="muestra">Muestra</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Caras impresas *</span>
            <select name="caras" value={form.caras} onChange={(event) => setField('caras', Number(event.target.value) as 1 | 2)} className={inputClass}>
              <option value={1}>1 cara: frente</option>
              <option value={2}>2 caras: frente y reverso</option>
            </select>
          </label>
        </div>
        <p className="text-sm font-semibold leading-6 text-slate-600">Impresión CMYK sobre la referencia kraft seleccionada. Servicio de impresión: {impresionSku}.</p>
        {form.modalidad === 'muestra' && <p className="text-sm font-semibold leading-6 text-slate-600">La muestra tiene la misma tarifa de impresión para una o dos caras. Nuestro equipo confirmará su valor en la propuesta; aquí no se ha consultado un precio.</p>}
        <p className="text-sm font-medium text-slate-500">Si cambias la bolsa o el número de caras, deberás subir los TIFF nuevamente. Cambiar entre producción y muestra conserva los artes.</p>
      </fieldset>

      <fieldset disabled={loading || !referencia} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">3. Cantidad, uso, entrega y contacto</legend>
        <label className="block space-y-2">
          <span className="block font-bold text-slate-800">Cantidad estimada *</span>
          <input name="cantidad" required type="number" min={1} max={10_000_000} step={1} inputMode="numeric" value={form.cantidad} onChange={(event) => setField('cantidad', event.target.value)} className={inputClass} placeholder="Unidades requeridas" />
        </label>
        <label className="block space-y-2">
          <span className="block font-bold text-slate-800">Producto y uso esperado *</span>
          <textarea name="uso_producto" required minLength={2} maxLength={500} rows={4} value={form.usoProducto} onChange={(event) => setField('usoProducto', event.target.value)} className={inputClass} placeholder="Describe qué vas a empacar, peso, presentación y condiciones de uso" />
        </label>
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
            <input name="email" type="email" maxLength={180} autoComplete="email" aria-describedby="personalizados-contacto-ayuda" value={form.email} onChange={(event) => setField('email', event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-2">
            <span className="block font-bold text-slate-800">Teléfono</span>
            <input name="telefono" type="tel" maxLength={50} autoComplete="tel" aria-describedby="personalizados-contacto-ayuda" value={form.telefono} onChange={(event) => setField('telefono', event.target.value)} className={inputClass} />
          </label>
        </div>
        <p id="personalizados-contacto-ayuda" className="text-sm font-medium text-slate-500">Debes ingresar al menos un correo o teléfono.</p>
        <label className="block space-y-2">
          <span className="block font-bold text-slate-800">Comentarios adicionales</span>
          <textarea name="comentarios" maxLength={2000} rows={5} value={form.comentarios} onChange={(event) => setField('comentarios', event.target.value)} className={inputClass} placeholder="Incluye restricciones, condiciones de almacenamiento u otra información relevante" />
        </label>
        <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          Sitio web
          <input name="sitio_web" tabIndex={-1} autoComplete="off" value={form.sitioWeb} onChange={(event) => setField('sitioWeb', event.target.value)} />
        </label>
      </fieldset>

      <fieldset disabled={loading || !referencia} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <legend className="px-2 text-xl font-black text-slate-950">4. Un TIFF por cada cara</legend>
        <p id="personalizados-arte-ayuda" className="text-sm font-semibold leading-6 text-slate-600">{form.caras === 1 ? 'Sube un TIFF para el frente.' : 'Sube dos TIFF por separado: uno para el frente y otro para el reverso.'} Máximo {fileSizeLabel(EMPAQUES_TIFF_MAX_BYTES)} por archivo; mínimo {EMPAQUES_MIN_PPP} ppp efectivos y recomendado {EMPAQUES_RECOMMENDED_PPP} ppp. La subida y validación son automáticas.</p>
        <p className="text-sm font-medium leading-6 text-slate-500">El arte se ajusta dentro del área fija conservando su proporción, sin recortar ni estirar. La vista previa PNG es privada y temporal. El color es orientativo: la impresión CMYK sobre kraft puede diferir de la pantalla.</p>
        {caras.map((cara) => {
          const estado = artes[cara];
          const listo = estado?.estado === 'validado' ? estado.arte : null;
          const pendiente = estado && 'progreso' in estado ? estado : null;
          const fallo = estado && 'mensaje' in estado ? estado : null;
          const nombreCara = cara === 'frente' ? 'Frente' : 'Reverso';
          const nombre = listo?.nombre || estado && 'nombre' in estado && estado.nombre;
          const inputId = `personalizados-tiff-${cara}`;
          return (
            <div key={`${form.sku}-${form.caras}-${cara}`} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="font-black text-slate-950">{nombreCara} · TIFF *</h3>
              {nombre && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                    <FileText className="h-4 w-4 shrink-0 text-[#9CBB06]" />
                    <span className="break-all">{nombre}</span>
                  </span>
                  <button type="button" disabled={loading} onClick={() => { if (submittingRef.current) return; cancelarSubida(cara); intentoRef.current = null; actualizarArte(cara); setError(null); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed" aria-label={`${pendiente ? 'Cancelar subida de' : 'Quitar archivo de'} ${nombreCara}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="relative">
                <input id={inputId} name={`archivo_${cara}`} type="file" accept=".tif,.tiff,image/tiff" aria-required="true" aria-describedby={`personalizados-arte-ayuda ${inputId}-estado`} aria-invalid={Boolean(fallo)} className="peer sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void handleFile(cara, file); }} />
                <label htmlFor={inputId} className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-[#9CBB06] hover:bg-[#9CBB06]/5 peer-focus-visible:ring-2 peer-focus-visible:ring-[#9CBB06] peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                  <Upload className="h-7 w-7 text-[#9CBB06]" />
                  <span className="mt-2 font-black text-slate-800">{estado ? 'Reemplazar TIFF' : 'Seleccionar TIFF'} de {cara}</span>
                </label>
              </div>
              <p id={`${inputId}-estado`} className={`text-sm font-semibold ${fallo ? 'text-red-700' : 'text-slate-600'}`} role="status">
                {fallo ? fallo.mensaje : listo ? `${nombreCara}: TIFF validado · ${fileSizeLabel(listo.tamano)}` : pendiente ? `${nombreCara}: ${pendiente.estado === 'iniciando' ? 'preparando subida' : pendiente.estado === 'subiendo' ? 'subiendo TIFF' : 'validando TIFF en el servidor'} · ${fileSizeLabel(pendiente.tamano)}` : `${nombreCara}: pendiente de archivo.`}
              </p>
              {pendiente?.estado === 'subiendo' && (
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
                  <progress value={pendiente.progreso} max={100} aria-label={`Subida de ${nombreCara}`} className="h-2 w-full accent-[#9CBB06]" />
                  <span>{pendiente.progreso}%</span>
                </div>
              )}
              {listo && referencia && (
                <div className="space-y-3">
                  <a href={listo.preview_url} target="_blank" rel="noopener noreferrer" className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#9CBB06]">
                    <div className="relative mx-auto w-full max-w-sm rounded-xl border border-slate-300 bg-slate-50" style={{ aspectRatio: `${referencia.ancho_cm} / ${referencia.alto_cm}` }}>
                      <Image src={listo.preview_url} alt={`Vista previa del arte de ${cara}, ajustado sin recorte al área de impresión`} fill unoptimized sizes="(max-width: 640px) 80vw, 384px" className="object-contain" onError={() => {
                        if (submittingRef.current) return;
                        const current = artesRef.current[cara];
                        if (current?.estado === 'validado' && current.arte.id === listo.id) actualizarArte(cara, { estado: 'expirado', nombre: listo.nombre, mensaje: 'No se pudo cargar la vista previa privada. Vuelve a subir el TIFF de esta cara.' });
                      }} />
                    </div>
                    <span className="mt-2 block text-center text-sm font-bold text-slate-700 underline">Ampliar vista previa de {cara} (nueva pestaña)</span>
                  </a>
                  <p className="text-sm font-semibold leading-6 text-slate-600">{listo.validacion.ancho_px} × {listo.validacion.alto_px} px · {listo.validacion.ppp_efectivos} ppp efectivos. Tamaño colocado: {listo.validacion.ancho_impresion_cm} cm de ancho × {listo.validacion.alto_impresion_cm} cm de alto.</p>
                  {listo.validacion.ppp_efectivos < EMPAQUES_RECOMMENDED_PPP && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">La resolución cumple el mínimo de {EMPAQUES_MIN_PPP} ppp, pero es menor a {EMPAQUES_RECOMMENDED_PPP} ppp. Recomendamos {EMPAQUES_RECOMMENDED_PPP} ppp o más para mayor definición.</p>}
                  {listo.validacion.proporcion_diferente && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">La proporción del arte difiere del área de impresión. Quedarán márgenes sin imprimir; no recortaremos ni estiraremos tu diseño.</p>}
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      <p className="text-sm font-medium leading-6 text-slate-500">Solo podrás enviar cuando todas las caras tengan su TIFF validado y vigente. Esta solicitud no calcula un precio ni crea automáticamente una orden en Odoo.</p>
      <button type="submit" disabled={loading || !artesListos} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#9CBB06] px-8 py-4 text-lg font-black text-slate-950 shadow-lg shadow-[#9CBB06]/20 transition hover:bg-[#8cab05] disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {loading ? 'Enviando solicitud...' : 'Solicitar propuesta personalizada'}
      </button>
    </form>
  );
}
