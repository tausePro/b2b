-- ============================================
-- Blindaje de pedido_items para catálogo portal
-- Si una empresa restringe el catálogo del portal,
-- solo permite insertar productos autorizados.
-- ============================================

DROP POLICY IF EXISTS "pedido_items_insert" ON public.pedido_items;

CREATE POLICY "pedido_items_insert" ON public.pedido_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.pedidos p
      LEFT JOIN public.empresa_configs ec
        ON ec.empresa_id = p.empresa_id
      WHERE p.id = pedido_id
        AND p.empresa_id = public.get_mi_empresa_id()
        AND p.usuario_creador_id = public.get_mi_usuario_id()
        AND (
          NOT COALESCE(
            CASE
              WHEN jsonb_typeof(ec.configuracion_extra -> 'restringir_catalogo_portal') = 'boolean'
                THEN (ec.configuracion_extra ->> 'restringir_catalogo_portal')::boolean
              ELSE false
            END,
            false
          )
          OR EXISTS (
            SELECT 1
            FROM public.productos_autorizados pa
            WHERE pa.empresa_id = p.empresa_id
              AND pa.odoo_product_id = public.pedido_items.odoo_product_id
              AND pa.activo = true
          )
        )
    )
  );
