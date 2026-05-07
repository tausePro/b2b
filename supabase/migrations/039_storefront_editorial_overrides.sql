CREATE TABLE IF NOT EXISTS public.storefront_category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_config_id UUID NOT NULL REFERENCES public.storefront_configs(id) ON DELETE CASCADE,
  odoo_categ_id INTEGER NOT NULL,
  nombre_publico TEXT,
  slug TEXT,
  descripcion_corta TEXT,
  descripcion_larga TEXT,
  imagen_url TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT true,
  destacado BOOLEAN NOT NULL DEFAULT false,
  seo_title TEXT,
  seo_description TEXT,
  contenido_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado_publicacion TEXT NOT NULL DEFAULT 'borrador' CHECK (estado_publicacion IN ('borrador', 'publicado')),
  creado_por UUID,
  actualizado_por UUID,
  publicado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(storefront_config_id, odoo_categ_id),
  UNIQUE(storefront_config_id, slug)
);

CREATE TABLE IF NOT EXISTS public.storefront_product_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_config_id UUID NOT NULL REFERENCES public.storefront_configs(id) ON DELETE CASCADE,
  odoo_product_id INTEGER NOT NULL,
  nombre_publico TEXT,
  slug TEXT,
  descripcion_corta TEXT,
  descripcion_larga TEXT,
  imagen_url TEXT,
  galeria JSONB NOT NULL DEFAULT '[]'::jsonb,
  beneficios JSONB NOT NULL DEFAULT '[]'::jsonb,
  usos_recomendados JSONB NOT NULL DEFAULT '[]'::jsonb,
  especificaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  orden INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT true,
  destacado BOOLEAN NOT NULL DEFAULT false,
  seo_title TEXT,
  seo_description TEXT,
  contenido_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado_publicacion TEXT NOT NULL DEFAULT 'borrador' CHECK (estado_publicacion IN ('borrador', 'publicado')),
  creado_por UUID,
  actualizado_por UUID,
  publicado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(storefront_config_id, odoo_product_id),
  UNIQUE(storefront_config_id, slug),
  CHECK (jsonb_typeof(galeria) = 'array'),
  CHECK (jsonb_typeof(beneficios) = 'array'),
  CHECK (jsonb_typeof(usos_recomendados) = 'array'),
  CHECK (jsonb_typeof(especificaciones) = 'object'),
  CHECK (jsonb_typeof(faqs) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_storefront_category_overrides_storefront
  ON public.storefront_category_overrides(storefront_config_id);
CREATE INDEX IF NOT EXISTS idx_storefront_category_overrides_odoo
  ON public.storefront_category_overrides(odoo_categ_id);
CREATE INDEX IF NOT EXISTS idx_storefront_category_overrides_public
  ON public.storefront_category_overrides(storefront_config_id, estado_publicacion, visible);
CREATE INDEX IF NOT EXISTS idx_storefront_category_overrides_destacado
  ON public.storefront_category_overrides(storefront_config_id, destacado, orden);

CREATE INDEX IF NOT EXISTS idx_storefront_product_overrides_storefront
  ON public.storefront_product_overrides(storefront_config_id);
CREATE INDEX IF NOT EXISTS idx_storefront_product_overrides_odoo
  ON public.storefront_product_overrides(odoo_product_id);
CREATE INDEX IF NOT EXISTS idx_storefront_product_overrides_public
  ON public.storefront_product_overrides(storefront_config_id, estado_publicacion, visible);
CREATE INDEX IF NOT EXISTS idx_storefront_product_overrides_destacado
  ON public.storefront_product_overrides(storefront_config_id, destacado, orden);

ALTER TABLE public.storefront_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_product_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storefront_category_overrides_select_public" ON public.storefront_category_overrides;
CREATE POLICY "storefront_category_overrides_select_public" ON public.storefront_category_overrides
  FOR SELECT TO anon, authenticated
  USING (
    visible = true
    AND estado_publicacion = 'publicado'
    AND EXISTS (
      SELECT 1
      FROM public.storefront_configs sc
      WHERE sc.id = storefront_category_overrides.storefront_config_id
        AND sc.activo = true
    )
  );

DROP POLICY IF EXISTS "storefront_category_overrides_manage_internal" ON public.storefront_category_overrides;
CREATE POLICY "storefront_category_overrides_manage_internal" ON public.storefront_category_overrides
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion', 'editor_contenido'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion', 'editor_contenido'));

DROP POLICY IF EXISTS "storefront_product_overrides_select_public" ON public.storefront_product_overrides;
CREATE POLICY "storefront_product_overrides_select_public" ON public.storefront_product_overrides
  FOR SELECT TO anon, authenticated
  USING (
    visible = true
    AND estado_publicacion = 'publicado'
    AND EXISTS (
      SELECT 1
      FROM public.storefront_configs sc
      WHERE sc.id = storefront_product_overrides.storefront_config_id
        AND sc.activo = true
    )
  );

DROP POLICY IF EXISTS "storefront_product_overrides_manage_internal" ON public.storefront_product_overrides;
CREATE POLICY "storefront_product_overrides_manage_internal" ON public.storefront_product_overrides
  FOR ALL TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion', 'editor_contenido'))
  WITH CHECK (public.get_mi_rol() IN ('super_admin', 'direccion', 'editor_contenido'));
