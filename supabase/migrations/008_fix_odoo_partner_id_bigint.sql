-- FIX: odoo_partner_id es INTEGER pero NITs colombianos exceden el rango (max ~2.1B)
-- Cambiar a BIGINT para soportar valores como 8909371468
ALTER TABLE public.empresas ALTER COLUMN odoo_partner_id TYPE BIGINT;
