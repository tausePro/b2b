-- ============================================
-- Seed: Empresa Demo + Usuario Comprador
-- Para probar el flujo completo del portal B2B
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- PASO 1: Crear empresa demo (usa odoo_partner_id=15 = John Alexander Valero Garza)
INSERT INTO public.empresas (
  odoo_partner_id,
  nombre,
  nit,
  presupuesto_global_mensual,
  config_aprobacion,
  activa
)
VALUES (
  15,
  'Empresa Demo Imprima',
  '900000001-1',
  50000000,
  '{"niveles": 1, "monto_auto_aprobacion": 500000}'::jsonb,
  true
)
ON CONFLICT (odoo_partner_id) DO NOTHING;

-- PASO 2: Config visual de la empresa demo
INSERT INTO public.empresa_configs (
  empresa_id,
  slug,
  color_primario,
  color_secundario,
  modulos_activos
)
SELECT
  e.id,
  'demo',
  '#9CBB06',
  '#333333',
  '{"presupuestos": true, "aprobaciones": true, "trazabilidad": true}'::jsonb
FROM public.empresas e
WHERE e.odoo_partner_id = 15
ON CONFLICT (empresa_id) DO NOTHING;

-- PASO 3: Sede principal de la empresa demo
INSERT INTO public.sedes (
  empresa_id,
  nombre_sede,
  direccion,
  ciudad,
  contacto_nombre,
  presupuesto_asignado,
  presupuesto_alerta_threshold,
  activa
)
SELECT
  e.id,
  'Sede Principal',
  'Calle 50 # 40-20',
  'Medellín',
  'Contacto Demo',
  10000000,
  80,
  true
FROM public.empresas e
WHERE e.odoo_partner_id = 15
ON CONFLICT DO NOTHING;

-- PASO 4: Productos autorizados para la empresa demo
-- (Odoo tiene productos con ID 1 y 2)
INSERT INTO public.productos_autorizados (empresa_id, odoo_product_id, activo)
SELECT e.id, 1, true
FROM public.empresas e
WHERE e.odoo_partner_id = 15
ON CONFLICT DO NOTHING;

INSERT INTO public.productos_autorizados (empresa_id, odoo_product_id, activo)
SELECT e.id, 2, true
FROM public.empresas e
WHERE e.odoo_partner_id = 15
ON CONFLICT DO NOTHING;

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT
  e.id AS empresa_id,
  e.nombre,
  e.odoo_partner_id,
  ec.slug,
  COUNT(DISTINCT s.id) AS sedes,
  COUNT(DISTINCT pa.id) AS productos_autorizados
FROM public.empresas e
LEFT JOIN public.empresa_configs ec ON ec.empresa_id = e.id
LEFT JOIN public.sedes s ON s.empresa_id = e.id
LEFT JOIN public.productos_autorizados pa ON pa.empresa_id = e.id
WHERE e.odoo_partner_id = 15
GROUP BY e.id, e.nombre, e.odoo_partner_id, ec.slug;
