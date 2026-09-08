BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

DO $$
BEGIN
  IF to_regclass('public.storefront_product_overrides') IS NULL THEN
    RAISE EXCEPTION 'Falta storefront_product_overrides. Revisa la migración 039 antes de continuar.';
  END IF;
END;
$$;

ALTER TABLE public.storefront_product_overrides
  ADD COLUMN IF NOT EXISTS ficha_tecnica_url TEXT;

COMMIT;
