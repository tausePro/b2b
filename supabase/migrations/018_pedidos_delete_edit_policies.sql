-- ============================================
-- Migración 018: Políticas RLS para eliminar pedidos (super_admin)
-- y editar items de pedidos (aprobador antes de aprobar)
-- ============================================

-- ============================================
-- HOTFIX 1: super_admin puede eliminar pedidos
-- Las FK de pedido_items, logs_trazabilidad, notificaciones, notificaciones_email
-- tienen ON DELETE CASCADE, pero RLS exige políticas DELETE explícitas.
-- ============================================

-- Pedidos: DELETE solo super_admin
DROP POLICY IF EXISTS "pedidos_delete_super_admin" ON public.pedidos;
CREATE POLICY "pedidos_delete_super_admin" ON public.pedidos
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- Pedido items: DELETE solo super_admin (para CASCADE + operaciones directas)
DROP POLICY IF EXISTS "pedido_items_delete_super_admin" ON public.pedido_items;
CREATE POLICY "pedido_items_delete_super_admin" ON public.pedido_items
  FOR DELETE TO authenticated
  USING (
    public.get_mi_rol() = 'super_admin'
    OR (
      -- Aprobador puede eliminar items de pedidos en_aprobacion de su empresa
      public.get_mi_rol() = 'aprobador'
      AND EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.id = pedido_id
          AND p.empresa_id = public.get_mi_empresa_id()
          AND p.estado = 'en_aprobacion'
      )
    )
  );

-- Logs trazabilidad: DELETE solo super_admin (para CASCADE)
DROP POLICY IF EXISTS "logs_trazabilidad_delete_super_admin" ON public.logs_trazabilidad;
CREATE POLICY "logs_trazabilidad_delete_super_admin" ON public.logs_trazabilidad
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- Notificaciones in-app: DELETE solo super_admin (limpieza admin, sin FK a pedidos)
DROP POLICY IF EXISTS "notificaciones_delete_super_admin" ON public.notificaciones;
CREATE POLICY "notificaciones_delete_super_admin" ON public.notificaciones
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- Notificaciones email: DELETE solo super_admin (limpieza admin, sin FK a pedidos)
DROP POLICY IF EXISTS "notificaciones_email_delete_super_admin" ON public.notificaciones_email;
CREATE POLICY "notificaciones_email_delete_super_admin" ON public.notificaciones_email
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- ============================================
-- HOTFIX 2: Aprobador puede editar items de pedidos en_aprobacion
-- ============================================

-- Pedido items: UPDATE para aprobador (solo pedidos en_aprobacion de su empresa)
DROP POLICY IF EXISTS "pedido_items_update_aprobador" ON public.pedido_items;
CREATE POLICY "pedido_items_update_aprobador" ON public.pedido_items
  FOR UPDATE TO authenticated
  USING (
    (
      public.get_mi_rol() = 'super_admin'
    )
    OR (
      public.get_mi_rol() = 'aprobador'
      AND EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.id = pedido_id
          AND p.empresa_id = public.get_mi_empresa_id()
          AND p.estado = 'en_aprobacion'
      )
    )
  )
  WITH CHECK (
    (
      public.get_mi_rol() = 'super_admin'
    )
    OR (
      public.get_mi_rol() = 'aprobador'
      AND EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.id = pedido_id
          AND p.empresa_id = public.get_mi_empresa_id()
          AND p.estado = 'en_aprobacion'
      )
    )
  );
