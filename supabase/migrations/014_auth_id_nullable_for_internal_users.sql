ALTER TABLE public.usuarios
  ALTER COLUMN auth_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_usuarios_auth_id_required_for_non_asesor'
      AND conrelid = 'public.usuarios'::regclass
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT chk_usuarios_auth_id_required_for_non_asesor
      CHECK (auth_id IS NOT NULL OR rol = 'asesor') NOT VALID;
  END IF;
END $$;

ALTER TABLE public.usuarios
  VALIDATE CONSTRAINT chk_usuarios_auth_id_required_for_non_asesor;

COMMENT ON COLUMN public.usuarios.auth_id IS
'Puede ser NULL únicamente para perfiles internos con rol asesor sincronizados desde Odoo pendientes de activación en Supabase Auth.';
