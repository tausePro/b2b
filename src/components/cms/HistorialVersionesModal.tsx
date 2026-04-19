'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, History, RotateCcw, Loader2, AlertCircle, Check } from 'lucide-react';

export interface VersionCmsItem {
  id: number;
  seccion_id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown> | null;
  imagen_url: string | null;
  orden: number | null;
  activo: boolean | null;
  creado_en: string;
  creado_por: string | null;
  nota: string | null;
  creador?: { nombre: string | null; email: string | null } | null;
}

interface Props {
  seccionId: string;
  seccionLabel: string;
  onClose: () => void;
  onRestored?: () => void;
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function creadorLabel(v: VersionCmsItem): string {
  if (v.creador?.nombre) return v.creador.nombre;
  if (v.creador?.email) return v.creador.email;
  if (v.creado_por) return 'Usuario ' + v.creado_por.slice(0, 8);
  return 'Sistema';
}

function previewContenido(v: VersionCmsItem): string {
  const partes: string[] = [];
  if (v.titulo) partes.push('"' + v.titulo.slice(0, 60) + '"');
  if (v.subtitulo) partes.push(v.subtitulo.slice(0, 80));
  if (!partes.length && v.contenido) {
    const keys = Object.keys(v.contenido);
    if (keys.length) partes.push(keys.slice(0, 4).join(', '));
  }
  return partes.join(' · ') || '(sin cambios de texto)';
}

export default function HistorialVersionesModal({ seccionId, seccionLabel, onClose, onRestored }: Props) {
  const [versiones, setVersiones] = useState<VersionCmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const cargarVersiones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/landing/contenido/' + encodeURIComponent(seccionId) + '/versiones');
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : 'Error';
        throw new Error(msg);
      }
      const lista = (data as { versiones?: VersionCmsItem[] }).versiones ?? [];
      setVersiones(lista);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }, [seccionId]);

  useEffect(() => {
    void cargarVersiones();
  }, [cargarVersiones]);

  const restaurar = async (versionId: number) => {
    setRestoring(versionId);
    setError(null);
    try {
      const res = await fetch(
        '/api/landing/contenido/' + encodeURIComponent(seccionId) + '/versiones/' + versionId + '/restaurar',
        { method: 'POST' }
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : 'Error';
        throw new Error(msg);
      }
      setRestored(versionId);
      setConfirming(null);
      onRestored?.();
      // recargar la lista porque se creó un nuevo snapshot con el estado anterior
      await cargarVersiones();
      setTimeout(() => setRestored(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restaurar');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-slate-800">Historial de versiones</h2>
              <p className="text-xs text-slate-500">{seccionLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && versiones.length === 0 && (
            <div className="text-center py-12 text-xs text-slate-500">
              Aún no hay versiones previas. El historial se genera al guardar cambios.
            </div>
          )}

          {!loading && versiones.length > 0 && (
            <ul className="space-y-2">
              {versiones.map((v) => {
                const esRestaurando = restoring === v.id;
                const esRestaurado = restored === v.id;
                const esConfirmando = confirming === v.id;
                return (
                  <li
                    key={v.id}
                    className="border border-border rounded-lg p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">{formatFecha(v.creado_en)}</span>
                          <span>·</span>
                          <span>{creadorLabel(v)}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 truncate">{previewContenido(v)}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {esConfirmando ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => void restaurar(v.id)}
                              disabled={esRestaurando}
                              className="text-[11px] bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                            >
                              {esRestaurando ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Confirmar'
                              )}
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1.5"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : esRestaurado ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                            <Check className="w-3 h-3" /> Restaurada
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirming(v.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-primary font-semibold px-2 py-1.5 rounded-md hover:bg-white transition-colors"
                            title="Restaurar esta versión"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border text-[11px] text-slate-400 text-center">
          Al restaurar se crea automáticamente una nueva versión del estado actual.
        </div>
      </div>
    </div>
  );
}
