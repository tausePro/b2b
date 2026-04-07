-- ============================================
-- 028: Permisos ampliados para dirección y aprobador
-- 100% aditiva, no modifica ni elimina nada existente
-- ============================================

-- 1. Dirección puede gestionar márgenes de venta (INSERT/UPDATE/DELETE)
CREATE POLICY "margenes_venta_insert_direccion" ON public.margenes_venta
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'direccion');

CREATE POLICY "margenes_venta_update_direccion" ON public.margenes_venta
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'direccion')
  WITH CHECK (public.get_mi_rol() = 'direccion');

CREATE POLICY "margenes_venta_delete_direccion" ON public.margenes_venta
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'direccion');

-- 2. Dirección puede gestionar overrides de precio por producto (INSERT/UPDATE/DELETE)
CREATE POLICY "precios_empresa_producto_insert_direccion" ON public.precios_empresa_producto
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'direccion');

CREATE POLICY "precios_empresa_producto_update_direccion" ON public.precios_empresa_producto
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'direccion')
  WITH CHECK (public.get_mi_rol() = 'direccion');

CREATE POLICY "precios_empresa_producto_delete_direccion" ON public.precios_empresa_producto
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'direccion');

-- 3. Dirección puede actualizar modo_pricing en empresa_configs
-- (ya tiene update via empresa_configs_update_admin que es super_admin)
-- Agregamos política para dirección
CREATE POLICY "empresa_configs_update_direccion" ON public.empresa_configs
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'direccion')
  WITH CHECK (public.get_mi_rol() = 'direccion');

-- 4. Aprobador puede ver y actualizar presupuestos de su empresa
CREATE POLICY "presupuestos_select_aprobador" ON public.presupuestos_mensuales
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() = 'aprobador'
    AND EXISTS (
      SELECT 1 FROM public.sedes s
      WHERE s.id = sede_id
        AND s.empresa_id = public.get_mi_empresa_id()
    )
  );

CREATE POLICY "presupuestos_update_aprobador" ON public.presupuestos_mensuales
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() = 'aprobador'
    AND EXISTS (
      SELECT 1 FROM public.sedes s
      WHERE s.id = sede_id
        AND s.empresa_id = public.get_mi_empresa_id()
    )
  )
  WITH CHECK (
    public.get_mi_rol() = 'aprobador'
    AND EXISTS (
      SELECT 1 FROM public.sedes s
      WHERE s.id = sede_id
        AND s.empresa_id = public.get_mi_empresa_id()
    )
  );

CREATE POLICY "presupuestos_insert_aprobador" ON public.presupuestos_mensuales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_mi_rol() = 'aprobador'
    AND EXISTS (
      SELECT 1 FROM public.sedes s
      WHERE s.id = sede_id
        AND s.empresa_id = public.get_mi_empresa_id()
    )
  );
