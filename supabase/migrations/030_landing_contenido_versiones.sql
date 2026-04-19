-- ============================================================
-- Migración 030: Historial de versiones del CMS (landing_contenido)
-- SEGURA: solo CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE. No hay DROPs ni cambios destructivos.
-- Idempotente: se puede reaplicar sin efectos secundarios.
-- ============================================================

-- 1. Columna de auditoría en la tabla principal
-- Sirve para que el trigger sepa quién originó el cambio.
-- Nullable para compatibilidad con filas existentes.
ALTER TABLE public.landing_contenido
  ADD COLUMN IF NOT EXISTS actualizado_por UUID;

-- 2. Tabla de versiones (snapshot inmutable del estado previo)
CREATE TABLE IF NOT EXISTS public.landing_contenido_versiones (
  id           BIGSERIAL PRIMARY KEY,
  seccion_id   TEXT NOT NULL REFERENCES public.landing_contenido(id) ON DELETE CASCADE,
  titulo       TEXT,
  subtitulo    TEXT,
  contenido    JSONB,
  imagen_url   TEXT,
  orden        INT,
  activo       BOOLEAN,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por   UUID,
  nota         TEXT
);

COMMENT ON TABLE public.landing_contenido_versiones IS
  'Historial inmutable de cambios en landing_contenido. Cada fila es el snapshot OLD antes de un UPDATE.';

-- 3. Índice para listar versiones por sección ordenadas
CREATE INDEX IF NOT EXISTS idx_landing_versiones_seccion_creado
  ON public.landing_contenido_versiones (seccion_id, creado_en DESC);

-- 4. Función trigger: snapshot BEFORE UPDATE
CREATE OR REPLACE FUNCTION public.snapshot_landing_contenido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.landing_contenido_versiones (
    seccion_id, titulo, subtitulo, contenido, imagen_url, orden, activo, creado_por
  ) VALUES (
    OLD.id,
    OLD.titulo,
    OLD.subtitulo,
    OLD.contenido,
    OLD.imagen_url,
    OLD.orden,
    OLD.activo,
    -- Preferimos el auth_id que el API pone en NEW.actualizado_por;
    -- si no está, usamos el último conocido; si tampoco, auth.uid() (puede ser NULL con service_role).
    COALESCE(NEW.actualizado_por, OLD.actualizado_por, auth.uid())
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.snapshot_landing_contenido() IS
  'Inserta en landing_contenido_versiones el estado OLD antes de cada UPDATE con cambios reales.';

-- 5. Trigger BEFORE UPDATE (solo cuando hay cambios en campos editables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'landing_contenido_versionar'
      AND tgrelid = 'public.landing_contenido'::regclass
  ) THEN
    CREATE TRIGGER landing_contenido_versionar
      BEFORE UPDATE ON public.landing_contenido
      FOR EACH ROW
      WHEN (
        OLD.titulo      IS DISTINCT FROM NEW.titulo OR
        OLD.subtitulo   IS DISTINCT FROM NEW.subtitulo OR
        OLD.contenido   IS DISTINCT FROM NEW.contenido OR
        OLD.imagen_url  IS DISTINCT FROM NEW.imagen_url OR
        OLD.orden       IS DISTINCT FROM NEW.orden OR
        OLD.activo      IS DISTINCT FROM NEW.activo
      )
      EXECUTE FUNCTION public.snapshot_landing_contenido();
  END IF;
END
$$;

-- 6. RLS: solo lectura para roles del CMS. Sin UPDATE/DELETE desde cliente (inmutable).
ALTER TABLE public.landing_contenido_versiones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'landing_contenido_versiones'
      AND policyname = 'landing_versiones_select_admin'
  ) THEN
    CREATE POLICY "landing_versiones_select_admin"
      ON public.landing_contenido_versiones FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.usuarios
          WHERE usuarios.auth_id = auth.uid()
            AND usuarios.rol IN ('super_admin', 'direccion', 'editor_contenido')
        )
      );
  END IF;
END
$$;
