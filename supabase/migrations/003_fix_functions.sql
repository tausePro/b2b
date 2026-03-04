-- ============================================
-- FIX: Convertir TODAS las funciones a plpgsql
-- para que SECURITY DEFINER funcione correctamente.
-- Ejecutar en Supabase SQL Editor.
-- ============================================

-- Verificar que las funciones existen y reemplazarlas
CREATE OR REPLACE FUNCTION public.get_mi_perfil()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT row_to_json(u) INTO v_result FROM (
    SELECT id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, avatar, activo, created_at
    FROM public.usuarios
    WHERE auth_id = auth.uid()
    LIMIT 1
  ) u;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_mi_empresa_id()
RETURNS UUID AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.usuarios WHERE auth_id = auth.uid();
  RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_mi_rol()
RETURNS TEXT AS $$
DECLARE
  v_rol TEXT;
BEGIN
  SELECT rol INTO v_rol FROM public.usuarios WHERE auth_id = auth.uid();
  RETURN v_rol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_mi_usuario_id()
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.usuarios WHERE auth_id = auth.uid();
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verificación: mostrar las funciones y su lenguaje
SELECT routine_name, external_language 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_mi_perfil', 'get_mi_empresa_id', 'get_mi_rol', 'get_mi_usuario_id', 'tiene_acceso_empresa');
