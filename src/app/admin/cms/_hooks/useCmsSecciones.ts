'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Seccion } from '../_types';

// Fila tal como la devuelve /api/landing/contenido?all=true: incluye
// tanto los campos publicados como los del borrador.
interface SeccionRow extends Seccion {
  titulo_borrador?: string | null;
  subtitulo_borrador?: string | null;
  contenido_borrador?: Record<string, unknown> | null;
  imagen_url_borrador?: string | null;
}

// Aplana la fila para el estado local del editor:
// - Si hay borrador, los campos editables reflejan el borrador.
// - Si no hay borrador, reflejan lo publicado.
// De esta forma los sub-editores no necesitan conocer el modelo dual.
function normalizarFila(row: SeccionRow): Seccion {
  if (row.tiene_borrador) {
    return {
      id: row.id,
      titulo: row.titulo_borrador ?? row.titulo,
      subtitulo: row.subtitulo_borrador ?? row.subtitulo,
      contenido: (row.contenido_borrador ?? row.contenido) as Record<string, unknown>,
      imagen_url: row.imagen_url_borrador ?? row.imagen_url,
      orden: row.orden,
      activo: row.activo,
      updated_at: row.updated_at,
      tiene_borrador: true,
      borrador_actualizado_en: row.borrador_actualizado_en ?? null,
    };
  }
  return {
    id: row.id,
    titulo: row.titulo,
    subtitulo: row.subtitulo,
    contenido: row.contenido,
    imagen_url: row.imagen_url,
    orden: row.orden,
    activo: row.activo,
    updated_at: row.updated_at,
    tiene_borrador: false,
    borrador_actualizado_en: null,
  };
}

// Hook central del editor CMS. Encapsula:
// - estado de secciones + flags de UI (loading, saving, saved, error, expanded, historial)
// - fetch inicial y recarga
// - mutaciones locales (updateLocal / updateContenido)
// - guardado y subida de imágenes contra la API
export function useCmsSecciones() {
  const [secciones, setSecciones] = useState<Record<string, Seccion>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [historialSeccion, setHistorialSeccion] = useState<string | null>(null);

  const fetchSecciones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/landing/contenido?all=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const rows = (data.contenido || {}) as Record<string, SeccionRow>;
      const normalizadas: Record<string, Seccion> = {};
      for (const [key, row] of Object.entries(rows)) {
        normalizadas[key] = normalizarFila(row);
      }
      setSecciones(normalizadas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando contenido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSecciones();
  }, [fetchSecciones]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateLocal = useCallback((id: string, changes: Partial<Seccion>) => {
    setSecciones((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...changes },
    }));
  }, []);

  const updateContenido = useCallback((id: string, key: string, value: unknown) => {
    setSecciones((prev) => {
      const sec = prev[id];
      if (!sec) return prev;
      return {
        ...prev,
        [id]: { ...sec, contenido: { ...sec.contenido, [key]: value } },
      };
    });
  }, []);

  const guardarSeccion = useCallback(
    async (id: string) => {
      const sec = secciones[id];
      if (!sec) return;

      setSaving(id);
      setError(null);
      try {
        const res = await fetch('/api/landing/contenido', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            titulo: sec.titulo,
            subtitulo: sec.subtitulo,
            contenido: sec.contenido,
            imagen_url: sec.imagen_url,
            orden: sec.orden,
            activo: sec.activo,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        // El backend escribió en *_borrador y devolvió la fila. Actualizamos las
        // flags de borrador en el estado local para que la UI refleje el nuevo
        // estado sin un refetch completo.
        const row = data.seccion as SeccionRow | undefined;
        if (row) {
          setSecciones((prev) => ({
            ...prev,
            [id]: {
              ...prev[id],
              tiene_borrador: row.tiene_borrador ?? prev[id].tiene_borrador,
              borrador_actualizado_en:
                row.borrador_actualizado_en ?? prev[id].borrador_actualizado_en ?? null,
              updated_at: row.updated_at ?? prev[id].updated_at,
              activo: row.activo ?? prev[id].activo,
              orden: row.orden ?? prev[id].orden,
            },
          }));
        }
        setSaved(id);
        setTimeout(() => setSaved(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error guardando');
      } finally {
        setSaving(null);
      }
    },
    [secciones],
  );

  // Publica el borrador: el backend copia *_borrador → campos públicos,
  // limpia las columnas de borrador y el trigger 030 snapshotea el estado previo.
  const publicarSeccion = useCallback(async (id: string) => {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(`/api/landing/contenido/${encodeURIComponent(id)}/publicar`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const row = data.seccion as SeccionRow | undefined;
      if (row) {
        setSecciones((prev) => ({ ...prev, [id]: normalizarFila(row) }));
      }
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error publicando');
    } finally {
      setSaving(null);
    }
  }, []);

  // Descarta el borrador. Devuelve la fila con tiene_borrador=false y los campos
  // publicados originales, que se aplanan al estado local vía normalizarFila.
  const descartarBorrador = useCallback(async (id: string) => {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/landing/contenido/${encodeURIComponent(id)}/descartar-borrador`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const row = data.seccion as SeccionRow | undefined;
      if (row) {
        setSecciones((prev) => ({ ...prev, [id]: normalizarFila(row) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error descartando borrador');
    } finally {
      setSaving(null);
    }
  }, []);

  const subirImagen = useCallback(async (file: File, folder: string): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    try {
      const res = await fetch('/api/landing/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo imagen');
      return null;
    }
  }, []);

  return {
    secciones,
    loading,
    saving,
    saved,
    error,
    expandedSections,
    historialSeccion,
    setError,
    setHistorialSeccion,
    fetchSecciones,
    toggleSection,
    updateLocal,
    updateContenido,
    guardarSeccion,
    publicarSeccion,
    descartarBorrador,
    subirImagen,
  };
}

export type CmsSeccionesCtx = ReturnType<typeof useCmsSecciones>;
