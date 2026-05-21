-- ============================================================
-- 041_pricing_permisos_asesor.sql
--
-- Habilita al rol `asesor` para gestionar márgenes y overrides de precio
-- pero ÚNICAMENTE sobre empresas que tenga asignadas en
-- `asesor_empresas` (la misma regla que ya usa la función
-- `tiene_acceso_empresa`).
--
-- También agrega columnas de auditoría livianas (`actualizado_por_id`)
-- para saber quién hizo el último cambio sobre cada margen/override sin
-- montar una tabla de log dedicada.
--
-- Es 100% aditiva: no toca políticas previas de super_admin/direccion ni
-- altera datos existentes. Si esta migración se revierte, márgenes y
-- precios siguen funcionando exactamente como antes con super_admin y
-- direccion.
-- ============================================================

-- 1. Auditoría: quién actualizó por última vez el registro.
-- Nullable + ON DELETE SET NULL para no romper si el asesor se elimina.
ALTER TABLE public.margenes_venta
  ADD COLUMN IF NOT EXISTS actualizado_por_id UUID
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.margenes_venta.actualizado_por_id IS
  'Usuario interno (super_admin, direccion o asesor) que hizo el último upsert sobre este margen. Util para auditar cambios cuando varios asesores tocan la misma empresa.';

ALTER TABLE public.precios_empresa_producto
  ADD COLUMN IF NOT EXISTS actualizado_por_id UUID
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.precios_empresa_producto.actualizado_por_id IS
  'Usuario interno (super_admin, direccion o asesor) que hizo el último upsert sobre este override de precio.';

-- 2. RLS: asesor con acceso a la empresa puede INSERT/UPDATE/DELETE
-- márgenes de sus empresas asignadas.
--
-- Usamos `tiene_acceso_empresa(empresa_id)` que ya incluye:
--   * super_admin    → true
--   * direccion      → true
--   * asesor         → true sólo si existe asesor_empresas(usuario, empresa, activo=true)
--   * usuarios cliente → true sólo si la empresa es la suya
--
-- Por defensa en profundidad, sumamos check explícito de rol asesor en
-- las políticas nuevas: aunque `tiene_acceso_empresa` ya filtre, evita
-- abrir escritura a roles cliente si en el futuro se amplía esa función.

DROP POLICY IF EXISTS "margenes_venta_insert_asesor" ON public.margenes_venta;
CREATE POLICY "margenes_venta_insert_asesor" ON public.margenes_venta
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "margenes_venta_update_asesor" ON public.margenes_venta;
CREATE POLICY "margenes_venta_update_asesor" ON public.margenes_venta
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  )
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "margenes_venta_delete_asesor" ON public.margenes_venta;
CREATE POLICY "margenes_venta_delete_asesor" ON public.margenes_venta
  FOR DELETE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  );

-- 3. RLS: asesor con acceso a la empresa puede INSERT/UPDATE/DELETE
-- overrides de precio de sus empresas asignadas.

DROP POLICY IF EXISTS "precios_empresa_producto_insert_asesor" ON public.precios_empresa_producto;
CREATE POLICY "precios_empresa_producto_insert_asesor" ON public.precios_empresa_producto
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "precios_empresa_producto_update_asesor" ON public.precios_empresa_producto;
CREATE POLICY "precios_empresa_producto_update_asesor" ON public.precios_empresa_producto
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  )
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "precios_empresa_producto_delete_asesor" ON public.precios_empresa_producto;
CREATE POLICY "precios_empresa_producto_delete_asesor" ON public.precios_empresa_producto
  FOR DELETE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_empresa(empresa_id)
  );

-- 4. NO se concede a asesor escritura sobre `empresa_configs.modo_pricing`.
-- La decisión "pricelist vs costo+margen" se mantiene como prerrogativa
-- de super_admin y direccion. Eso evita que un asesor cambie el modelo
-- general de precios de un cliente al editar márgenes.
