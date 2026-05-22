-- ============================================================
-- 042_asesor_storefronts.sql
--
-- Habilita al rol `asesor` para gestionar márgenes y overrides de precio
-- de storefronts públicos (p.ej. empaques) pero ÚNICAMENTE sobre los
-- storefronts que tenga asignados en la nueva tabla `asesor_storefronts`.
--
-- Paralelo a lo que se hizo con empresas cliente en 041_pricing_permisos_asesor.sql.
--
-- Lo que NO toca:
--   * No modifica `storefront_configs.modo_pricing`, root categories ni
--     pricelist: esas decisiones siguen siendo prerrogativa de
--     super_admin / direccion.
--   * No cambia las políticas existentes para super_admin/direccion/editor_contenido.
--
-- Es 100% aditiva: agrega tabla, función, columnas opcionales y políticas
-- paralelas. Si se revierte, el sistema sigue funcionando como hoy con
-- super_admin y direccion.
-- ============================================================

-- ============================================================
-- 1. Tabla de asignación asesor ↔ storefront
-- Análoga a `asesor_empresas` pero apuntando a `storefront_configs`.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.asesor_storefronts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  storefront_config_id UUID NOT NULL REFERENCES public.storefront_configs(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, storefront_config_id)
);

COMMENT ON TABLE public.asesor_storefronts IS
  'Asignaciones de asesor (rol Imprima) a storefronts públicos. Sólo los asesores presentes acá con activo=true pueden editar márgenes y precios del storefront correspondiente.';

CREATE INDEX IF NOT EXISTS idx_asesor_storefronts_usuario
  ON public.asesor_storefronts(usuario_id);
CREATE INDEX IF NOT EXISTS idx_asesor_storefronts_storefront
  ON public.asesor_storefronts(storefront_config_id);
CREATE INDEX IF NOT EXISTS idx_asesor_storefronts_activo
  ON public.asesor_storefronts(activo)
  WHERE activo = true;

ALTER TABLE public.asesor_storefronts ENABLE ROW LEVEL SECURITY;

-- Gestión completa para super_admin / direccion.
DROP POLICY IF EXISTS "asesor_storefronts_manage_internal" ON public.asesor_storefronts;
CREATE POLICY "asesor_storefronts_manage_internal" ON public.asesor_storefronts
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion'));

-- Cada asesor puede ver sus propias asignaciones (no las de otros asesores)
-- para que la UI pueda renderizar el listado de storefronts que administra.
DROP POLICY IF EXISTS "asesor_storefronts_select_self" ON public.asesor_storefronts;
CREATE POLICY "asesor_storefronts_select_self" ON public.asesor_storefronts
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND usuario_id = public.get_mi_usuario_id()
  );

-- ============================================================
-- 2. Función: ¿el usuario autenticado tiene acceso a este storefront?
-- Misma lógica que `tiene_acceso_empresa` pero contra `asesor_storefronts`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.tiene_acceso_storefront(p_storefront_config_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_rol TEXT;
  v_usuario_id UUID;
BEGIN
  SELECT id, rol INTO v_usuario_id, v_rol
  FROM public.usuarios WHERE auth_id = auth.uid();

  -- super_admin y direccion: acceso global a todos los storefronts.
  IF v_rol IN ('super_admin', 'direccion') THEN
    RETURN true;
  END IF;

  -- editor_contenido: acceso global a todos los storefronts (mantiene el
  -- comportamiento previo de las rutas /api/admin/storefronts donde ya
  -- aparece en EDITOR_ROLES para catálogo / categorías / productos).
  IF v_rol = 'editor_contenido' THEN
    RETURN true;
  END IF;

  -- asesor: sólo storefronts asignados explícitamente.
  IF v_rol = 'asesor' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.asesor_storefronts
      WHERE usuario_id = v_usuario_id
        AND storefront_config_id = p_storefront_config_id
        AND activo = true
    );
  END IF;

  -- Cualquier otro rol (cliente, etc.): sin acceso a configuración interna
  -- del storefront. Pueden consumir el catálogo público vía las políticas
  -- de SELECT sobre `storefront_configs.activo = true` ya existentes.
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.tiene_acceso_storefront(UUID) IS
  'Devuelve true si el usuario autenticado puede gestionar el storefront indicado: super_admin/direccion siempre, editor_contenido siempre (catálogo editorial), asesor sólo si está asignado en asesor_storefronts activo=true.';

-- ============================================================
-- 3. Auditoría: columna actualizado_por_id en márgenes y overrides de storefront.
-- Nullable + ON DELETE SET NULL para no romper si el asesor se elimina.
-- ============================================================
ALTER TABLE public.storefront_margenes_venta
  ADD COLUMN IF NOT EXISTS actualizado_por_id UUID
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.storefront_margenes_venta.actualizado_por_id IS
  'Usuario interno (super_admin, direccion o asesor asignado) que hizo el último upsert sobre este margen del storefront. Util para auditar quién tocó el pricing.';

ALTER TABLE public.storefront_precios_producto
  ADD COLUMN IF NOT EXISTS actualizado_por_id UUID
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.storefront_precios_producto.actualizado_por_id IS
  'Usuario interno (super_admin, direccion o asesor asignado) que hizo el último upsert sobre este override de precio del storefront.';

-- ============================================================
-- 4. RLS sobre storefront_margenes_venta: extender a asesor con acceso.
-- Las políticas previas (super_admin / direccion) se mantienen intactas.
-- ============================================================
DROP POLICY IF EXISTS "storefront_margenes_select_asesor" ON public.storefront_margenes_venta;
CREATE POLICY "storefront_margenes_select_asesor" ON public.storefront_margenes_venta
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

DROP POLICY IF EXISTS "storefront_margenes_insert_asesor" ON public.storefront_margenes_venta;
CREATE POLICY "storefront_margenes_insert_asesor" ON public.storefront_margenes_venta
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

DROP POLICY IF EXISTS "storefront_margenes_update_asesor" ON public.storefront_margenes_venta;
CREATE POLICY "storefront_margenes_update_asesor" ON public.storefront_margenes_venta
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  )
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

DROP POLICY IF EXISTS "storefront_margenes_delete_asesor" ON public.storefront_margenes_venta;
CREATE POLICY "storefront_margenes_delete_asesor" ON public.storefront_margenes_venta
  FOR DELETE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

-- ============================================================
-- 5. RLS sobre storefront_precios_producto: extender a asesor con acceso.
-- ============================================================
DROP POLICY IF EXISTS "storefront_precios_select_asesor" ON public.storefront_precios_producto;
CREATE POLICY "storefront_precios_select_asesor" ON public.storefront_precios_producto
  FOR SELECT TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

DROP POLICY IF EXISTS "storefront_precios_insert_asesor" ON public.storefront_precios_producto;
CREATE POLICY "storefront_precios_insert_asesor" ON public.storefront_precios_producto
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

DROP POLICY IF EXISTS "storefront_precios_update_asesor" ON public.storefront_precios_producto;
CREATE POLICY "storefront_precios_update_asesor" ON public.storefront_precios_producto
  FOR UPDATE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  )
  WITH CHECK (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

DROP POLICY IF EXISTS "storefront_precios_delete_asesor" ON public.storefront_precios_producto;
CREATE POLICY "storefront_precios_delete_asesor" ON public.storefront_precios_producto
  FOR DELETE TO authenticated
  USING (
    public.get_mi_rol() = 'asesor'
    AND public.tiene_acceso_storefront(storefront_config_id)
  );

-- ============================================================
-- 6. NO se concede a asesor escritura sobre `storefront_configs`.
-- Cambiar modo_pricing, pricelist, categorías raíz, subdominio o activar/
-- desactivar el storefront sigue siendo prerrogativa de super_admin / direccion.
-- Esto evita que un asesor cambie el modelo general de pricing del storefront
-- al editar márgenes específicos.
-- ============================================================
