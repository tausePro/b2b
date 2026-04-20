-- ============================================================
-- Migración 031: Draft/Publish para landing_contenido
-- SEGURA: solo ADD COLUMN IF NOT EXISTS. No hay DROPs ni cambios
-- destructivos. Idempotente: se puede reaplicar sin efectos.
-- ============================================================
--
-- Modelo: borrador paralelo (estándar Contentful/Sanity/Strapi).
-- La landing pública sigue leyendo titulo/subtitulo/contenido/imagen_url.
-- El admin edita siempre en las columnas *_borrador. Al "publicar"
-- se copian los campos *_borrador → campos públicos y se dispara
-- el trigger de versionado existente (migración 030).
--
-- Importante: el trigger 'landing_contenido_versionar' (030) NO mira
-- las columnas *_borrador, así que escribir un borrador no genera
-- snapshot en landing_contenido_versiones. El snapshot solo ocurre
-- cuando se publica (se tocan los campos oficiales).
-- ============================================================

-- 1. Columnas de borrador (espejo de los campos editables)
ALTER TABLE public.landing_contenido
  ADD COLUMN IF NOT EXISTS titulo_borrador            TEXT,
  ADD COLUMN IF NOT EXISTS subtitulo_borrador         TEXT,
  ADD COLUMN IF NOT EXISTS contenido_borrador         JSONB,
  ADD COLUMN IF NOT EXISTS imagen_url_borrador        TEXT,
  ADD COLUMN IF NOT EXISTS tiene_borrador             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS borrador_actualizado_en    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS borrador_actualizado_por   UUID;

COMMENT ON COLUMN public.landing_contenido.tiene_borrador IS
  'TRUE cuando hay cambios en *_borrador que aún no han sido publicados.';
COMMENT ON COLUMN public.landing_contenido.contenido_borrador IS
  'Copia de trabajo del JSON editable. Se promueve a contenido al publicar.';

-- 2. Índice para listar rápidamente secciones con borrador pendiente
CREATE INDEX IF NOT EXISTS idx_landing_contenido_tiene_borrador
  ON public.landing_contenido (tiene_borrador)
  WHERE tiene_borrador = TRUE;
