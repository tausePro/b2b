-- ============================================================
-- 040_storefront_pricelist_source.sql
-- Storefronts: agregar Pricelist Odoo como fuente de productos.
--
-- Migración ADITIVA y SEGURA:
--   * Solo agrega una columna nueva opcional a storefront_configs.
--   * No hace DROP, no cambia tipos, no toca datos existentes.
--   * Si odoo_pricelist_id queda en NULL (default), el storefront sigue
--     funcionando exactamente como hoy (fuente = odoo_root_category_ids).
--   * Si se setea un INTEGER > 0, el storefront resuelve productos vía la
--     pricelist Odoo (modelo product.pricelist) y deriva las categorías
--     visibles desde los productos resueltos.
--
-- Decisión de negocio (Imprima, mayo 2026): Nicolás administra una pricelist
-- llamada "PAGINA WEB EMPAQUES" en Odoo donde lista los productos del
-- storefront público de empaques. Esta migración habilita esa fuente sin
-- romper el flujo previo basado en categorías raíz.
-- ============================================================

ALTER TABLE public.storefront_configs
  ADD COLUMN IF NOT EXISTS odoo_pricelist_id INTEGER NULL;

COMMENT ON COLUMN public.storefront_configs.odoo_pricelist_id IS
  'ID de la pricelist en Odoo (product.pricelist) que define los productos del storefront. Si es NULL se usa odoo_root_category_ids como fuente; si es INTEGER > 0 los productos vienen de esa pricelist y las categorías mostradas se derivan de los productos resueltos.';

CREATE INDEX IF NOT EXISTS idx_storefront_configs_pricelist
  ON public.storefront_configs(odoo_pricelist_id)
  WHERE odoo_pricelist_id IS NOT NULL;
