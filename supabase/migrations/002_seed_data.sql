-- ============================================
-- Seed Data: Super Admin Imprima
-- Ejecutar DESPUÉS de 001_schema_inicial.sql
-- ============================================

-- Insertar super_admin buscando el auth_id dinámicamente desde auth.users
-- Si el usuario ya existe en public.usuarios, no hace nada (ON CONFLICT)
INSERT INTO public.usuarios (auth_id, email, nombre, apellido, rol, empresa_id, sede_id)
SELECT
  au.id,
  au.email,
  'Felipe',
  'Tause',
  'super_admin',
  NULL,
  NULL
FROM auth.users au
WHERE au.email = 'felipe@tause.co'
ON CONFLICT (auth_id) DO NOTHING;

-- (Vacío intencionalmente)
-- Las empresas, sedes y productos_autorizados se crean
-- a través de la integración con Odoo o manualmente
-- desde el panel de administración.
