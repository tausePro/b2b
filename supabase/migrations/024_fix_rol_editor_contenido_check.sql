-- ============================================================
-- Migración 024: Fix CHECK constraint de rol en usuarios
-- La migración 022 agregó el rol editor_contenido a las
-- políticas RLS pero NO actualizó el CHECK constraint
-- de la columna rol en la tabla usuarios.
-- ============================================================

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('super_admin', 'comprador', 'aprobador', 'asesor', 'direccion', 'editor_contenido'));

-- También actualizar el constraint de auth_id para incluir editor_contenido
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS chk_usuarios_auth_id_required_for_non_asesor;

ALTER TABLE public.usuarios
  ADD CONSTRAINT chk_usuarios_auth_id_required_for_non_asesor
  CHECK (auth_id IS NOT NULL OR rol IN ('asesor', 'editor_contenido')) NOT VALID;
