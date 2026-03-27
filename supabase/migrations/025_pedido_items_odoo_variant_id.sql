-- Migración 025: Agregar columna odoo_variant_id a pedido_items
-- Permite almacenar el ID de la variante específica (product.product) de Odoo
-- cuando el usuario selecciona una variante del producto en el catálogo.

ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS odoo_variant_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN public.pedido_items.odoo_variant_id IS
  'ID del product.product (variante) en Odoo. NULL si el producto no tiene variantes o se usa el template por defecto.';
