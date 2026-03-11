-- ============================================
-- Auto-recuperación de perfil por email
-- Caso: auth.users.id cambia y usuarios.auth_id queda desincronizado
-- ============================================

CREATE OR REPLACE FUNCTION public.enlazar_mi_usuario_por_email()
RETURNS JSON AS $$
DECLARE
  v_email TEXT;
  v_result JSON;
  v_target_id UUID;
BEGIN
  -- Si no hay sesión JWT autenticada, no hacemos nada
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si ya existe perfil enlazado por auth_id actual, retornarlo de inmediato
  SELECT row_to_json(u) INTO v_result
  FROM (
    SELECT id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, avatar, activo, created_at
    FROM public.usuarios
    WHERE auth_id = auth.uid()
    LIMIT 1
  ) u;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  v_email := LOWER(COALESCE((auth.jwt() ->> 'email'), ''));

  IF v_email = '' THEN
    RETURN NULL;
  END IF;

  -- Elegimos un solo perfil por email para evitar actualizar múltiples filas.
  SELECT id INTO v_target_id
  FROM public.usuarios
  WHERE LOWER(email) = v_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.usuarios
  SET auth_id = auth.uid(),
      updated_at = now()
  WHERE id = v_target_id;

  SELECT row_to_json(u) INTO v_result
  FROM (
    SELECT id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, avatar, activo, created_at
    FROM public.usuarios
    WHERE auth_id = auth.uid()
    LIMIT 1
  ) u;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.enlazar_mi_usuario_por_email IS
'Intenta recuperar el perfil del usuario autenticado enlazando usuarios.auth_id con auth.uid() usando el email del JWT.';
