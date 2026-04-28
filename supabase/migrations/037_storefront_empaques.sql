-- ============================================
-- Storefronts / Unidades de negocio públicas
-- Empaques se modela separado de empresas cliente B2B.
-- ============================================

CREATE TABLE IF NOT EXISTS public.storefront_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  subdominio TEXT UNIQUE,
  modo_pricing TEXT NOT NULL DEFAULT 'costo_margen' CHECK (modo_pricing IN ('pricelist', 'costo_margen')),
  activo BOOLEAN NOT NULL DEFAULT true,
  odoo_root_category_ids INTEGER[] NOT NULL DEFAULT '{}',
  odoo_excluded_category_ids INTEGER[] NOT NULL DEFAULT '{}',
  configuracion_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.storefront_configs IS 'Configuración de storefronts públicos o unidades de negocio internas, separados de empresas cliente B2B.';
COMMENT ON COLUMN public.storefront_configs.slug IS 'Identificador público del storefront, por ejemplo empaques.';
COMMENT ON COLUMN public.storefront_configs.odoo_root_category_ids IS 'Categorías raíz Odoo que alimentan el catálogo público del storefront.';
COMMENT ON COLUMN public.storefront_configs.odoo_excluded_category_ids IS 'Categorías Odoo a excluir del storefront aunque estén bajo una raíz permitida.';

CREATE TABLE IF NOT EXISTS public.storefront_margenes_venta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_config_id UUID NOT NULL REFERENCES public.storefront_configs(id) ON DELETE CASCADE,
  odoo_categ_id INTEGER,
  margen_porcentaje NUMERIC(6,2) NOT NULL CHECK (margen_porcentaje >= 0 AND margen_porcentaje <= 999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(storefront_config_id, odoo_categ_id)
);

COMMENT ON TABLE public.storefront_margenes_venta IS 'Márgenes por storefront y categoría Odoo. odoo_categ_id NULL representa margen default.';

CREATE TABLE IF NOT EXISTS public.storefront_precios_producto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_config_id UUID NOT NULL REFERENCES public.storefront_configs(id) ON DELETE CASCADE,
  odoo_product_id INTEGER NOT NULL,
  precio_override NUMERIC(14,2) NOT NULL CHECK (precio_override >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(storefront_config_id, odoo_product_id)
);

COMMENT ON TABLE public.storefront_precios_producto IS 'Overrides manuales de precio por producto Odoo para storefronts públicos.';

CREATE INDEX IF NOT EXISTS idx_storefront_configs_slug ON public.storefront_configs(slug);
CREATE INDEX IF NOT EXISTS idx_storefront_configs_activo ON public.storefront_configs(activo);
CREATE INDEX IF NOT EXISTS idx_storefront_margenes_storefront ON public.storefront_margenes_venta(storefront_config_id);
CREATE INDEX IF NOT EXISTS idx_storefront_margenes_categoria ON public.storefront_margenes_venta(odoo_categ_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_storefront_margenes_default_unique
  ON public.storefront_margenes_venta(storefront_config_id)
  WHERE odoo_categ_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_precios_storefront ON public.storefront_precios_producto(storefront_config_id);
CREATE INDEX IF NOT EXISTS idx_storefront_precios_producto ON public.storefront_precios_producto(odoo_product_id);

ALTER TABLE public.storefront_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_margenes_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_precios_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storefront_configs_select_public" ON public.storefront_configs;
CREATE POLICY "storefront_configs_select_public" ON public.storefront_configs
  FOR SELECT TO anon, authenticated
  USING (activo = true);

DROP POLICY IF EXISTS "storefront_configs_manage_internal" ON public.storefront_configs;
CREATE POLICY "storefront_configs_manage_internal" ON public.storefront_configs
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion'));

DROP POLICY IF EXISTS "storefront_margenes_select_internal" ON public.storefront_margenes_venta;
CREATE POLICY "storefront_margenes_select_internal" ON public.storefront_margenes_venta
  FOR SELECT TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'));

DROP POLICY IF EXISTS "storefront_margenes_manage_internal" ON public.storefront_margenes_venta;
CREATE POLICY "storefront_margenes_manage_internal" ON public.storefront_margenes_venta
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion'));

DROP POLICY IF EXISTS "storefront_precios_select_internal" ON public.storefront_precios_producto;
CREATE POLICY "storefront_precios_select_internal" ON public.storefront_precios_producto
  FOR SELECT TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'));

DROP POLICY IF EXISTS "storefront_precios_manage_internal" ON public.storefront_precios_producto;
CREATE POLICY "storefront_precios_manage_internal" ON public.storefront_precios_producto
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion'));

INSERT INTO public.storefront_configs (
  slug,
  nombre,
  subdominio,
  modo_pricing,
  activo,
  odoo_root_category_ids,
  odoo_excluded_category_ids,
  configuracion_extra
)
VALUES (
  'empaques',
  'Imprima Empaques',
  'empaques.imprima.com.co',
  'costo_margen',
  true,
  ARRAY[132, 11],
  ARRAY[103],
  '{"descripcion":"Storefront público de la unidad de negocio Empaques."}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  subdominio = EXCLUDED.subdominio,
  modo_pricing = EXCLUDED.modo_pricing,
  activo = EXCLUDED.activo,
  odoo_root_category_ids = EXCLUDED.odoo_root_category_ids,
  odoo_excluded_category_ids = EXCLUDED.odoo_excluded_category_ids,
  updated_at = now();

UPDATE public.storefront_margenes_venta smv
SET
  margen_porcentaje = 20.00,
  updated_at = now()
FROM public.storefront_configs sc
WHERE sc.slug = 'empaques'
  AND smv.storefront_config_id = sc.id
  AND smv.odoo_categ_id IS NULL;

INSERT INTO public.storefront_margenes_venta (
  storefront_config_id,
  odoo_categ_id,
  margen_porcentaje
)
SELECT sc.id, NULL, 20.00
FROM public.storefront_configs sc
WHERE sc.slug = 'empaques'
  AND NOT EXISTS (
    SELECT 1
    FROM public.storefront_margenes_venta smv
    WHERE smv.storefront_config_id = sc.id
      AND smv.odoo_categ_id IS NULL
  );
