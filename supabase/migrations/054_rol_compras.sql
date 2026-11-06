-- Migración 054: rol interno "compras".
-- Ejecutar manualmente en Supabase antes de crear usuarios con el rol Compras.
-- Compras consulta el historial de compras a proveedores (Odoo, vía API), el
-- catálogo y los pedidos del portal en SOLO LECTURA. No ve leads.
-- Las políticas nuevas son únicamente SELECT; no se modifican las de escritura.

BEGIN;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('super_admin', 'comprador', 'aprobador', 'asesor', 'direccion', 'editor_contenido', 'compras'));

ALTER TABLE public.usuario_roles_extra DROP CONSTRAINT IF EXISTS usuario_roles_extra_rol_valido;
ALTER TABLE public.usuario_roles_extra ADD CONSTRAINT usuario_roles_extra_rol_valido
  CHECK (rol IN ('super_admin', 'comprador', 'aprobador', 'asesor', 'direccion', 'editor_contenido', 'compras'));

DROP POLICY IF EXISTS "pedidos_select_compras" ON public.pedidos;
CREATE POLICY "pedidos_select_compras" ON public.pedidos
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'compras'));

DROP POLICY IF EXISTS "pedido_items_select_compras" ON public.pedido_items;
CREATE POLICY "pedido_items_select_compras" ON public.pedido_items
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'compras'));

DROP POLICY IF EXISTS "logs_trazabilidad_select_compras" ON public.logs_trazabilidad;
CREATE POLICY "logs_trazabilidad_select_compras" ON public.logs_trazabilidad
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'compras'));

DROP POLICY IF EXISTS "empresas_select_compras" ON public.empresas;
CREATE POLICY "empresas_select_compras" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'compras'));

DROP POLICY IF EXISTS "sedes_select_compras" ON public.sedes;
CREATE POLICY "sedes_select_compras" ON public.sedes
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'compras'));

DROP POLICY IF EXISTS "usuarios_select_compras" ON public.usuarios;
CREATE POLICY "usuarios_select_compras" ON public.usuarios
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'compras'));

COMMIT;
