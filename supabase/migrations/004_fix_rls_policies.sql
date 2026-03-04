-- ============================================
-- FIX: Reescribir políticas RLS que causan recursión
-- Las políticas de usuarios y pedidos usaban subconsultas
-- directas a la misma tabla, causando recursión con RLS.
-- Ahora usan las funciones SECURITY DEFINER (plpgsql)
-- que bypasean RLS correctamente.
-- ============================================

-- 1. USUARIOS: Eliminar política vieja y recrear con funciones helper
DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;

CREATE POLICY "usuarios_select" ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR public.get_mi_rol() IN ('super_admin', 'direccion')
    OR (
      empresa_id IS NOT NULL
      AND empresa_id = public.get_mi_empresa_id()
    )
    OR (
      empresa_id IS NOT NULL
      AND public.get_mi_rol() = 'asesor'
      AND EXISTS (
        SELECT 1 FROM public.asesor_empresas ae
        WHERE ae.usuario_id = public.get_mi_usuario_id()
          AND ae.empresa_id = usuarios.empresa_id
          AND ae.activo = true
      )
    )
  );

-- 2. USUARIOS CRUD: Reescribir con funciones helper
DROP POLICY IF EXISTS "usuarios_insert_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_admin" ON public.usuarios;

CREATE POLICY "usuarios_insert_admin" ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "usuarios_update_admin" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "usuarios_delete_admin" ON public.usuarios
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- Verificación
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public' AND tablename IN ('usuarios', 'pedidos')
ORDER BY tablename, policyname;
