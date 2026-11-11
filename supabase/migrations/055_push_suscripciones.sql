-- Migración 055: suscripciones de notificaciones push (PWA del portal).
-- Ejecutar manualmente en Supabase. Cada fila es un dispositivo/navegador de un usuario.
-- Solo el service role (APIs del portal) lee y escribe; no hay políticas para usuarios.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  ultimo_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_suscripciones_usuario_activas
  ON public.push_suscripciones(usuario_id) WHERE activo;

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_suscripciones FROM anon, authenticated;

COMMIT;
