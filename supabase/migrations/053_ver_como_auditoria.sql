-- Migración 053: auditoría del modo "ver como" (solo lectura) del Super Admin.
-- Ejecutar manualmente en Supabase antes de usar Admin > Ver como usuario.
-- Solo el service role escribe y lee esta tabla; no tiene políticas para usuarios.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ver_como_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  objetivo_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  iniciado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_at TIMESTAMPTZ,
  motivo_fin TEXT CHECK (motivo_fin IN ('salida', 'expirado', 'error')),
  ip TEXT,
  user_agent TEXT,
  CHECK (actor_id <> objetivo_id)
);

CREATE INDEX IF NOT EXISTS idx_ver_como_auditoria_actor ON public.ver_como_auditoria(actor_id, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ver_como_auditoria_objetivo ON public.ver_como_auditoria(objetivo_id, iniciado_at DESC);

ALTER TABLE public.ver_como_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ver_como_auditoria FROM anon, authenticated;

COMMIT;
