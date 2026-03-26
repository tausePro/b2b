ALTER TABLE public.pedido_items
  ADD COLUMN tipo_item TEXT NOT NULL DEFAULT 'catalogo',
  ADD COLUMN unidad TEXT,
  ADD COLUMN referencia_cliente TEXT,
  ADD COLUMN comentarios_item TEXT;

ALTER TABLE public.pedido_items
  ALTER COLUMN odoo_product_id DROP NOT NULL;

ALTER TABLE public.pedido_items
  ADD CONSTRAINT pedido_items_tipo_item_check
  CHECK (tipo_item IN ('catalogo', 'especial'));

ALTER TABLE public.pedido_items
  ADD CONSTRAINT pedido_items_catalogo_especial_consistencia_check
  CHECK (
    (tipo_item = 'catalogo' AND odoo_product_id IS NOT NULL)
    OR (tipo_item = 'especial' AND odoo_product_id IS NULL)
  );

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
          public.pedido_items.tipo_item = 'especial'
          OR NOT COALESCE(
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
