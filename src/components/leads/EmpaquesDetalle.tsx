'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Package } from 'lucide-react';
import type { EmpaquesPersonalizadosArchivo, EmpaquesPersonalizadosDetalle } from '@/lib/empaques/personalizados-shared';

function formatMeasures(detail: EmpaquesPersonalizadosDetalle) {
  if (detail.medida_largo === null && detail.medida_ancho === null && detail.medida_alto === null) return 'Por definir';
  return [detail.medida_largo ?? '—', detail.medida_ancho ?? '—', detail.medida_alto ?? '—'].join(' × ') + ` ${detail.unidad_medida}`;
}

function safeFileUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function EmpaquesArchivo({ file }: { file: EmpaquesPersonalizadosArchivo }) {
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const signedUrl = safeFileUrl(file.signed_url);
  const previewUrl = file.preview_path && /\.png$/i.test(file.preview_path) ? safeFileUrl(file.preview_url) : null;
  const cara = file.cara === 'frente' ? 'Frente' : file.cara === 'reverso' ? 'Reverso' : null;
  const isTiff = file.tipo === 'image/tiff' || /\.tiff?$/i.test(file.nombre);
  const validation = file.validacion;
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-border bg-white p-3 text-xs">
      <div>
        <p className="font-semibold text-foreground">{cara ?? 'Archivo histórico'}</p>
        <p className="break-all text-muted">{file.nombre} · {(file.tamano / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 2 })} MiB</p>
      </div>
      {previewUrl && failedPreviewUrl !== previewUrl ? (
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block text-center font-medium text-muted hover:text-foreground">
          <Image src={previewUrl} alt={`Vista previa${cara ? ` de la cara ${cara.toLowerCase()}` : ''}: ${file.nombre}`} width={640} height={480} unoptimized referrerPolicy="no-referrer"
            onError={() => setFailedPreviewUrl(previewUrl)} className="h-32 w-full rounded-lg border border-border bg-background-light object-contain" />
          <span className="mt-1 block">Ampliar sin recorte</span>
        </a>
      ) : isTiff || file.preview_path ? <p className="text-muted">Vista previa no disponible; el TIFF original se consulta descargándolo.</p> : null}
      {validation && (
        <p className={validation.resolucion_recomendada ? 'text-[#5c7004]' : 'text-amber-700'}>
          {validation.ppp_efectivos.toLocaleString('es-CO', { maximumFractionDigits: 0 })} ppp · {validation.resolucion_recomendada ? 'recomendado' : 'bajo lo recomendado'}
          {validation.proporcion_diferente ? ' · proporción ajustada sin recorte' : ''}
        </p>
      )}
      {signedUrl
        ? <a href={signedUrl} download={file.nombre} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full border border-border px-3 py-1 font-medium hover:bg-background-light">{isTiff ? 'Descargar TIFF original' : 'Descargar archivo'}</a>
        : <p className="text-amber-700">Descarga no disponible: actualiza el lead para renovar los enlaces privados.</p>}
    </div>
  );
}

/** Configuración del empaque personalizado del lead (producto, cantidad, caras, área, entrega y artes). */
export default function EmpaquesDetalle({ detail }: { detail: EmpaquesPersonalizadosDetalle }) {
  const isReferencia = Boolean(detail.referencia_sku || detail.impresion_sku || detail.modalidad || detail.caras != null || detail.area_alto_cm != null || detail.area_ancho_cm != null);
  const fields: [string, string][] = [
    [isReferencia ? 'Producto' : 'Tipo', detail.tipo_empaque],
    ['Cantidad', String(detail.cantidad)],
    ...(isReferencia ? [
      ['Modalidad', detail.modalidad === 'muestra' ? 'Muestra' : detail.modalidad === 'produccion' ? 'Producción' : 'No registrada'],
      ['Caras', detail.caras != null ? String(detail.caras) : 'No registradas'],
      ['Área impresión (alto × ancho)', detail.area_alto_cm != null && detail.area_ancho_cm != null ? `${detail.area_alto_cm} × ${detail.area_ancho_cm} cm` : 'No registrada'],
      ['SKU referencia / impresión', `${detail.referencia_sku || '—'} / ${detail.impresion_sku || '—'}`],
    ] as [string, string][] : [
      ['Medidas (largo × ancho × alto)', formatMeasures(detail)], ['Material', detail.material || 'Por definir'], ['Impresión', detail.impresion || 'Por definir'],
    ] as [string, string][]),
    ['Entrega', `${detail.ciudad_entrega || 'Por definir'}${detail.fecha_requerida ? ` · ${detail.fecha_requerida}` : ''}`],
  ];
  return (
    <section aria-labelledby="lead-empaque" className="space-y-3">
      <h3 id="lead-empaque" className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-primary" aria-hidden="true" />Empaque personalizado</h3>
      <dl className="grid grid-cols-2 gap-2">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-background-light p-2.5"><dt className="text-[11px] text-muted">{label}</dt><dd className="mt-0.5 text-sm font-semibold break-words">{value}</dd></div>
        ))}
      </dl>
      {detail.uso_producto && <p className="text-sm"><span className="font-semibold">Uso:</span> {detail.uso_producto}</p>}
      {detail.comentarios && <p className="text-sm"><span className="font-semibold">Comentarios:</span> {detail.comentarios}</p>}
      {detail.archivos.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{detail.archivos.map((file) => <EmpaquesArchivo key={file.path} file={file} />)}</div>}
    </section>
  );
}
