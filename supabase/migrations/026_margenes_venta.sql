-- ============================================
-- 026: Tabla de márgenes de venta por empresa y categoría Odoo
-- 100% aditiva, no modifica ni elimina nada existente
-- ============================================

-- Tabla principal: margen de venta por combinación empresa + categoría Odoo
CREATE TABLE IF NOT EXISTS public.margenes_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  odoo_categ_id INT, -- NULL = margen por defecto de la empresa
  margen_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_margenes_empresa_categ UNIQUE (empresa_id, odoo_categ_id)
);

COMMENT ON TABLE public.margenes_venta IS 'Margen de venta (%) por empresa y categoría de producto Odoo. Si odoo_categ_id es NULL, es el margen por defecto de la empresa.';
COMMENT ON COLUMN public.margenes_venta.odoo_categ_id IS 'ID de product.category en Odoo. NULL indica margen por defecto para la empresa.';
COMMENT ON COLUMN public.margenes_venta.margen_porcentaje IS 'Porcentaje de margen sobre el costo (standard_price). Ej: 22.00 = 22%. No incluye IVA.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_margenes_venta_empresa ON public.margenes_venta(empresa_id);
CREATE INDEX IF NOT EXISTS idx_margenes_venta_empresa_categ ON public.margenes_venta(empresa_id, odoo_categ_id);

-- Trigger updated_at (reutiliza la función existente)
CREATE TRIGGER trigger_updated_at_margenes_venta
  BEFORE UPDATE ON public.margenes_venta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- RLS: misma lógica que empresa_configs
-- SELECT: quien tenga acceso a la empresa
-- INSERT/UPDATE/DELETE: solo super_admin
-- ============================================
ALTER TABLE public.margenes_venta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "margenes_venta_select" ON public.margenes_venta
  FOR SELECT TO authenticated
  USING (public.tiene_acceso_empresa(empresa_id));

CREATE POLICY "margenes_venta_insert_admin" ON public.margenes_venta
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "margenes_venta_update_admin" ON public.margenes_venta
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "margenes_venta_delete_admin" ON public.margenes_venta
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');
