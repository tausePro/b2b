-- ============================================
-- EMERGENCIA: Insertar super_admin en usuarios
-- Ejecutar en Supabase SQL Editor (usa rol postgres, bypasea RLS)
-- URL: https://supabase.com/dashboard/project/mubdgefafbijdliblccl/sql/new
-- ============================================

-- 1. Verificar que el usuario existe en auth.users
SELECT id, email, created_at FROM auth.users WHERE email = 'felipe@tause.co';

-- 2. Verificar estado actual de public.usuarios
SELECT count(*) as total_usuarios FROM public.usuarios;

-- 3. Insertar super_admin (busca auth_id dinámicamente)
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

-- 4. Confirmar inserción
SELECT id, email, rol, auth_id, activo FROM public.usuarios;
