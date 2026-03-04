-- ============================================
-- Odoo comercial mapping (incremental)
-- Agrega trazabilidad del comercial de Odoo por empresa
-- y mapeo opcional de asesores locales con odoo_user_id.
-- ============================================

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS odoo_comercial_id INTEGER;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS odoo_comercial_nombre TEXT;

COMMENT ON COLUMN public.empresas.odoo_comercial_id IS
  'ID del comercial (res.users) asignado en Odoo al partner matriz.';

COMMENT ON COLUMN public.empresas.odoo_comercial_nombre IS
  'Nombre del comercial asignado en Odoo al momento de la importación/sincronización.';

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS odoo_user_id INTEGER;

COMMENT ON COLUMN public.usuarios.odoo_user_id IS
  'ID de res.users en Odoo para mapear asesores locales con comerciales del ERP.';

DROP INDEX IF EXISTS public.idx_usuarios_asesor_odoo_user_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_asesor_odoo_user_unique
  ON public.usuarios(odoo_user_id)
  WHERE rol = 'asesor' AND odoo_user_id IS NOT NULL;
