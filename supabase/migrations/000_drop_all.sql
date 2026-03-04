-- ============================================
-- LIMPIAR TODO antes de recrear el esquema
-- Ejecutar PRIMERO en Supabase SQL Editor
-- ============================================

-- Nota: no se dropean triggers explícitamente porque al eliminar tablas
-- con CASCADE se eliminan también sus triggers dependientes.

-- Eliminar funciones (CASCADE para eliminar políticas RLS que dependen de ellas)
DROP FUNCTION IF EXISTS public.descontar_presupuesto_al_aprobar() CASCADE;
DROP FUNCTION IF EXISTS public.set_estado_pedido_inicial() CASCADE;
DROP FUNCTION IF EXISTS public.generar_numero_pedido() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.tiene_acceso_empresa(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_mi_perfil() CASCADE;
DROP FUNCTION IF EXISTS public.get_mi_empresa_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_mi_rol() CASCADE;
DROP FUNCTION IF EXISTS public.get_mi_usuario_id() CASCADE;

-- Eliminar tablas (orden inverso por dependencias)
DROP TABLE IF EXISTS public.odoo_sync_logs CASCADE;
DROP TABLE IF EXISTS public.odoo_configs CASCADE;
DROP TABLE IF EXISTS public.logs_trazabilidad CASCADE;
DROP TABLE IF EXISTS public.pedido_items CASCADE;
DROP TABLE IF EXISTS public.pedido_lineas CASCADE;
DROP TABLE IF EXISTS public.pedidos CASCADE;
DROP TABLE IF EXISTS public.presupuestos_mensuales CASCADE;
DROP TABLE IF EXISTS public.productos_autorizados CASCADE;
DROP TABLE IF EXISTS public.catalogo CASCADE;
DROP TABLE IF EXISTS public.asesor_empresas CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.sedes CASCADE;
DROP TABLE IF EXISTS public.empresa_configs CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;
