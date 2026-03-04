-- ============================================
-- Tabla para almacenar configuración de conexión Odoo
-- Puede ser global (empresa_id NULL) o por empresa
-- ============================================

CREATE TABLE IF NOT EXISTS public.odoo_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  odoo_url TEXT NOT NULL,
  odoo_db TEXT NOT NULL,
  odoo_username TEXT NOT NULL,
  odoo_password TEXT NOT NULL,
  odoo_version TEXT DEFAULT '16.0',
  activa BOOLEAN DEFAULT true,
  ultimo_test_exitoso BOOLEAN DEFAULT false,
  ultimo_test_fecha TIMESTAMPTZ,
  ultimo_test_mensaje TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_odoo_config_empresa UNIQUE (empresa_id)
);

COMMENT ON TABLE public.odoo_configs IS 'Configuración de conexión a Odoo. empresa_id NULL = configuración global.';
COMMENT ON COLUMN public.odoo_configs.odoo_password IS 'Contraseña o API Key de Odoo. En producción considerar cifrado.';

-- RLS
ALTER TABLE public.odoo_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "odoo_configs_select_admin" ON public.odoo_configs
  FOR SELECT TO authenticated
  USING (public.get_mi_rol() IN ('super_admin', 'direccion'));

CREATE POLICY "odoo_configs_insert_admin" ON public.odoo_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "odoo_configs_update_admin" ON public.odoo_configs
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

CREATE POLICY "odoo_configs_delete_admin" ON public.odoo_configs
  FOR DELETE TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

-- Trigger updated_at
CREATE TRIGGER trigger_updated_at_odoo_configs
  BEFORE UPDATE ON public.odoo_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Índice
CREATE INDEX idx_odoo_configs_empresa ON public.odoo_configs(empresa_id);
