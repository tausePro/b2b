-- ============================================
-- Seed: Usuario Comprador Demo
-- INSTRUCCIONES:
-- 1. Primero crea el usuario en Supabase Dashboard:
--    Authentication > Users > Add User
--    Email: comprador@demo.com
--    Password: Demo2026*
-- 2. Luego ejecuta este SQL en el SQL Editor
-- ============================================

-- Insertar usuario comprador vinculado a la empresa demo y su sede
INSERT INTO public.usuarios (
  auth_id,
  email,
  nombre,
  apellido,
  rol,
  empresa_id,
  sede_id,
  activo
)
SELECT
  au.id,
  au.email,
  'Comprador',
  'Demo',
  'comprador',
  e.id,
  s.id,
  true
FROM auth.users au
CROSS JOIN public.empresas e
CROSS JOIN public.sedes s
WHERE au.email = 'comprador@demo.com'
  AND e.odoo_partner_id = 15
  AND s.empresa_id = e.id
  AND s.nombre_sede = 'Sede Principal'
ON CONFLICT (auth_id) DO UPDATE SET
  empresa_id = EXCLUDED.empresa_id,
  sede_id = EXCLUDED.sede_id,
  rol = EXCLUDED.rol;

-- Insertar usuario aprobador demo
INSERT INTO public.usuarios (
  auth_id,
  email,
  nombre,
  apellido,
  rol,
  empresa_id,
  sede_id,
  activo
)
SELECT
  au.id,
  au.email,
  'Aprobador',
  'Demo',
  'aprobador',
  e.id,
  NULL,
  true
FROM auth.users au
CROSS JOIN public.empresas e
WHERE au.email = 'aprobador@demo.com'
  AND e.odoo_partner_id = 15
ON CONFLICT (auth_id) DO UPDATE SET
  empresa_id = EXCLUDED.empresa_id,
  rol = EXCLUDED.rol;

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT
  u.email,
  u.nombre,
  u.rol,
  e.nombre AS empresa,
  s.nombre_sede AS sede
FROM public.usuarios u
LEFT JOIN public.empresas e ON e.id = u.empresa_id
LEFT JOIN public.sedes s ON s.id = u.sede_id
WHERE u.email IN ('comprador@demo.com', 'aprobador@demo.com', 'felipe@tause.co')
ORDER BY u.rol;
