-- ============================================
-- 027: Modo de pricing por empresa + override manual de precios por producto
-- 100% aditiva, no modifica ni elimina nada existente
-- ============================================

-- 1. Agregar campo modo_pricing a empresa_configs
ALTER TABLE public.empresa_configs
  ADD COLUMN IF NOT EXISTS modo_pricing TEXT NOT NULL DEFAULT 'costo_margen';

COMMENT ON COLUMN public.empresa_configs.modo_pricing IS 'Modo de cálculo de precios: pricelist (usa precio fijo de lista de Odoo) o costo_margen (calcula standard_price × margen). Default: costo_margen.';

-- 2. Tabla de overrides manuales de precio por producto por empresa
CREATE TABLE IF NOT EXISTS public.precios_empresa_producto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  odoo_product_id INT NOT NULL,
  precio_override NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_precio_empresa_producto UNIQUE (empresa_id, odoo_product_id)
);

COMMENT ON TABLE public.precios_empresa_producto IS 'Override manual de precio por producto por empresa. Si existe, tiene prioridad sobre pricelist y costo+margen.';
COMMENT ON COLUMN public.precios_empresa_producto.odoo_product_id IS 'ID de product.template en Odoo.';
COMMENT ON COLUMN public.precios_empresa_producto.precio_override IS 'Precio de venta fijado manualmente. Tiene máxima prioridad.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_precios_empresa_producto_empresa ON public.precios_empresa_producto(empresa_id);
CREATE INDEX IF NOT EXISTS idx_precios_empresa_producto_lookup ON public.precios_empresa_producto(empresa_id, odoo_product_id);

-- Trigger updated_at
CREATE TRIGGER trigger_updated_at_precios_empresa_producto
  BEFORE UPDATE ON public.precios_empresa_producto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- RLS: misma lógica que margenes_venta
-- ============================================
ALTER TABLE public.precios_empresa_producto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precios_empresa_producto_select" ON public.precios_empresa_producto
  FOR SELECT TO authenticated
  USING (public.tiene_acceso_empresa(empresa_id));

CREATE POLICY "precios_empresa_producto_insert_admin" ON public.precios_empresa_producto
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "precios_empresa_producto_update_admin" ON public.precios_empresa_producto
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "precios_empresa_producto_delete_admin" ON public.precios_empresa_producto
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');
