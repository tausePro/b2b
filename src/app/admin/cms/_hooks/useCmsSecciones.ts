'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Seccion } from '../_types';

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
      setSecciones(data.contenido || {});
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
    subirImagen,
  };
}

export type CmsSeccionesCtx = ReturnType<typeof useCmsSecciones>;
