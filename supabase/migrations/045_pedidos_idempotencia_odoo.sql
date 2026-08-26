ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS odoo_sync_status TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS odoo_sync_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS odoo_sync_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_odoo_sync_status_check'
      AND conrelid = 'public.pedidos'::regclass
  ) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_odoo_sync_status_check
      CHECK (odoo_sync_status IN ('pendiente', 'procesando', 'completado', 'error'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_idempotency_key
  ON public.pedidos(usuario_creador_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_odoo_sale_order_unique
  ON public.pedidos(odoo_sale_order_id)
  WHERE odoo_sale_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generar_numero_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_num INTEGER;
  year_str TEXT;
BEGIN
  year_str := to_char(now(), 'YYYY');
  PERFORM pg_advisory_xact_lock(hashtext('pedidos_numero_' || year_str));

  SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.pedidos
  WHERE numero LIKE 'PED-' || year_str || '-%';

  NEW.numero := 'PED-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pedido_odoo_sync(p_pedido_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.pedidos
  SET odoo_sync_status = 'procesando',
      odoo_sync_started_at = now(),
      odoo_sync_error = NULL
  WHERE id = p_pedido_id
    AND odoo_sale_order_id IS NULL
    AND (
      odoo_sync_status IN ('pendiente', 'error')
      OR (
        odoo_sync_status = 'procesando'
        AND odoo_sync_started_at < now() - interval '10 minutes'
      )
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pedido_odoo_sync(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pedido_odoo_sync(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.claim_pedido_odoo_sync(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pedido_odoo_sync(UUID) TO service_role;
