'use client';

/**
 * MediaUpload — uploader genérico para imágenes y PDFs de un storefront.
 *
 * Decisión:
 *   - El componente NO conoce de qué storefront se trata: recibe `uploadUrl`.
 *     Esto permite reusarlo para Empaques hoy y otros storefronts mañana sin
 *     tocar código.
 *   - Tampoco persiste el valor; sólo se encarga de subir y devolver la URL
 *     pública vía `onChange`. La página dueña decide cuándo guardar.
 *   - Para PDFs no podemos hacer preview real sin un visor; mostramos el
 *     nombre del archivo (último segmento del path) y un link "Abrir PDF".
 */

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';

export type MediaKind = 'imagen' | 'pdf';

interface MediaUploadProps {
  label: string;
  /** URL pública actual (ya subida). Vacío/null = sin archivo. */
  value: string | null;
  /** Llamado tras subir o tras eliminar (cadena vacía). */
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  /** Endpoint que recibe FormData con `file`, `kind`, `folder`. */
  uploadUrl: string;
  /** Tipo de medio aceptado. Default: imagen. */
  kind?: MediaKind;
  /**
   * Sub-carpeta para organizar dentro del bucket. El backend la sanitiza,
   * acá sólo se sugiere (e.g. 'productos', 'categorias', 'fichas').
   */
  folder?: string;
  /** Texto auxiliar bajo el control (formato sugerido, peso, etc.). */
  helpText?: string;
  /** Disable interno (mientras se guarda el form padre, por ejemplo). */
  disabled?: boolean;
}

const ACCEPT_BY_KIND: Record<MediaKind, string> = {
  imagen: 'image/jpeg,image/png,image/svg+xml,image/webp,image/gif',
  pdf: 'application/pdf',
};

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? url;
  } catch {
    const segments = url.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? url;
  }
}

export function MediaUpload({
  label,
  value,
  onChange,
  onUploadingChange,
  uploadUrl,
  kind = 'imagen',
  folder,
  helpText,
  disabled = false,
}: MediaUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const uploadingChangeRef = useRef<MediaUploadProps['onUploadingChange']>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    const controller = uploadRef.current;
    uploadRef.current = null;
    controller?.abort();
    uploadingChangeRef.current?.(false);
    uploadingChangeRef.current = undefined;
  }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset el input para que el mismo archivo pueda re-seleccionarse luego
    // de un fallo o para forzar otra subida.
    event.target.value = '';
    if (!file || disabled || uploadRef.current) return;

    setError(null);
    if (kind === 'imagen' && file.size > 4 * 1024 * 1024) {
      setError('La imagen supera el límite de 4 MiB. Reduce su tamaño antes de subirla.');
      return;
    }

    const controller = new AbortController();
    uploadRef.current = controller;
    uploadingChangeRef.current = onUploadingChange;
    setUploading(true);
    onUploadingChange?.(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      if (folder) formData.append('folder', folder);

      const response = await fetch(uploadUrl, { method: 'POST', body: formData, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('El archivo supera el tamaño permitido por el servidor. Reduce su tamaño e inténtalo de nuevo.');
        }
        throw new Error(typeof data?.error === 'string' && data.error.trim() ? data.error : `No se pudo subir el archivo (HTTP ${response.status}). Inténtalo de nuevo.`);
      }
      if (typeof data?.url !== 'string' || !data.url.trim()) {
        throw new Error('El servidor no devolvió una URL válida. Inténtalo de nuevo.');
      }
      if (uploadRef.current === controller && !controller.signal.aborted) {
        onChange(data.url);
      }
    } catch (uploadError) {
      if (uploadRef.current === controller && !controller.signal.aborted) {
        setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo.');
      }
    } finally {
      if (uploadRef.current === controller) {
        uploadRef.current = null;
        setUploading(false);
        uploadingChangeRef.current?.(false);
        uploadingChangeRef.current = undefined;
      }
    }
  };

  const handleRemove = () => {
    if (disabled || uploadRef.current) return;
    setError(null);
    onChange('');
  };

  const accept = ACCEPT_BY_KIND[kind];
  const hasValue = Boolean(value);
  const isImage = kind === 'imagen';

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">{label}</label>

      <div className="flex items-start gap-3">
        {hasValue && isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value!}
            alt={label}
            className="h-20 w-20 shrink-0 rounded-lg border border-border bg-slate-50 object-contain"
          />
        )}

        {hasValue && !isImage && (
          <a
            href={value!}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            title={value ?? undefined}
          >
            <FileText className="h-4 w-4 text-rose-600" />
            <span className="max-w-[180px] truncate">{fileNameFromUrl(value!)}</span>
          </a>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || disabled}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {hasValue ? 'Reemplazar' : isImage ? 'Subir imagen' : 'Subir PDF'}
            </button>

            {hasValue && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading || disabled}
                className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Quitar archivo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {helpText && !error && <p className="text-xs text-slate-500">{helpText}</p>}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={uploading || disabled}
          aria-label={label}
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
