-- ============================================
-- RPC: crear_empresa_admin
-- SECURITY DEFINER para bypasear RLS
-- Solo super_admin puede ejecutarla
-- Ejecutar en Supabase SQL Editor
-- ============================================

CREATE OR REPLACE FUNCTION public.crear_empresa_admin(
  p_nombre TEXT,
  p_nit TEXT DEFAULT NULL,
  p_odoo_partner_id BIGINT DEFAULT 0,
  p_presupuesto_global NUMERIC DEFAULT NULL,
  p_requiere_aprobacion BOOLEAN DEFAULT true,
  p_usa_sedes BOOLEAN DEFAULT true,
  p_config_aprobacion JSONB DEFAULT '{"niveles": 1, "monto_auto_aprobacion": null}'::jsonb,
  p_slug TEXT DEFAULT NULL,
  p_color_primario TEXT DEFAULT '#9CBB06',
  p_color_secundario TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL,
  p_modulos_activos JSONB DEFAULT '{"presupuestos": true, "aprobaciones": true, "trazabilidad": true}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_rol TEXT;
  v_empresa_id UUID;
BEGIN
  -- Verificar que el usuario es super_admin
  SELECT rol INTO v_rol FROM public.usuarios WHERE auth_id = auth.uid();
  IF v_rol IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Solo super_admin puede crear empresas';
  END IF;

  -- Crear empresa
  INSERT INTO public.empresas (
    nombre,
    nit,
    odoo_partner_id,
    presupuesto_global_mensual,
    requiere_aprobacion,
    usa_sedes,
    config_aprobacion
  )
  VALUES (
    p_nombre,
    p_nit,
    p_odoo_partner_id,
    p_presupuesto_global,
    p_requiere_aprobacion,
    p_usa_sedes,
    p_config_aprobacion
  )
  RETURNING id INTO v_empresa_id;

  -- Crear config
  INSERT INTO public.empresa_configs (empresa_id, slug, color_primario, color_secundario, logo_url, modulos_activos)
  VALUES (v_empresa_id, p_slug, p_color_primario, p_color_secundario, p_logo_url, p_modulos_activos);

  RETURN v_empresa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
