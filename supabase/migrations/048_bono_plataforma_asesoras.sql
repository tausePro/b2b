BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

DO $$
DECLARE
  v_dependencia TEXT;
BEGIN
  FOREACH v_dependencia IN ARRAY ARRAY[
    'public.usuarios', 'public.empresas', 'public.pedidos',
    'public.asesor_empresas', 'public.usuario_roles_extra', 'public.usuario_empresas'
  ] LOOP
    IF to_regclass(v_dependencia) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla requerida %. No se aplicó la migración 048.', v_dependencia;
    END IF;
  END LOOP;

  FOREACH v_dependencia IN ARRAY ARRAY[
    'public.get_mi_usuario_id()', 'public.update_updated_at()',
    'public.usuario_tiene_rol_o_extra(uuid,text)'
  ] LOOP
    IF to_regprocedure(v_dependencia) IS NULL THEN
      RAISE EXCEPTION 'Falta la función requerida %. No se aplicó la migración 048.', v_dependencia;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.asesor_empresas
  ADD COLUMN IF NOT EXISTS bono_plataforma_activo BOOLEAN,
  ADD COLUMN IF NOT EXISTS bono_plataforma_desde DATE,
  ADD COLUMN IF NOT EXISTS bono_plataforma_activado_at TIMESTAMPTZ;

UPDATE public.asesor_empresas
SET bono_plataforma_activo = true,
    bono_plataforma_desde = DATE '2026-09-01',
    bono_plataforma_activado_at = TIMESTAMPTZ '2026-09-01 00:00:00-05'
WHERE bono_plataforma_desde IS NULL;

ALTER TABLE public.asesor_empresas
  ALTER COLUMN bono_plataforma_activo SET DEFAULT true,
  ALTER COLUMN bono_plataforma_activo SET NOT NULL,
  ALTER COLUMN bono_plataforma_desde SET DEFAULT GREATEST((now() AT TIME ZONE 'America/Bogota')::DATE, DATE '2026-09-01'),
  ALTER COLUMN bono_plataforma_desde SET NOT NULL,
  ALTER COLUMN bono_plataforma_activado_at SET DEFAULT now();

ALTER TABLE public.asesor_empresas
  DROP CONSTRAINT IF EXISTS asesor_empresas_bono_vigencia_check;
ALTER TABLE public.asesor_empresas
  ADD CONSTRAINT asesor_empresas_bono_vigencia_check CHECK (bono_plataforma_desde >= DATE '2026-09-01');

CREATE TABLE IF NOT EXISTS public.comision_periodos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  periodo DATE NOT NULL,
  porcentaje_bono NUMERIC(5,2) NOT NULL DEFAULT 0.50 CHECK (porcentaje_bono = 0.50),
  estado TEXT NOT NULL DEFAULT 'provisional' CHECK (estado IN ('provisional', 'cerrado', 'pagado')),
  clientes_activos INTEGER NOT NULL DEFAULT 0 CHECK (clientes_activos >= 0),
  facturas_count INTEGER NOT NULL DEFAULT 0 CHECK (facturas_count >= 0),
  notas_credito_count INTEGER NOT NULL DEFAULT 0 CHECK (notas_credito_count >= 0),
  base_facturada NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (base_facturada >= 0),
  notas_credito NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (notas_credito >= 0),
  base_neta NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (base_neta >= 0),
  bono_total NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (bono_total >= 0),
  snapshot_generado_at TIMESTAMPTZ,
  cerrado_at TIMESTAMPTZ,
  cerrado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  pagado_at TIMESTAMPTZ,
  pagado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asesor_id, periodo),
  CHECK (EXTRACT(DAY FROM periodo) = 1)
);

CREATE TABLE IF NOT EXISTS public.comision_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comision_periodo_id UUID NOT NULL REFERENCES public.comision_periodos(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  bono_vigente_desde DATE NOT NULL,
  facturas_count INTEGER NOT NULL DEFAULT 0 CHECK (facturas_count >= 0),
  notas_credito_count INTEGER NOT NULL DEFAULT 0 CHECK (notas_credito_count >= 0),
  base_facturada NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (base_facturada >= 0),
  notas_credito NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (notas_credito >= 0),
  base_neta NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (base_neta >= 0),
  bono NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (bono >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comision_periodo_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS public.comision_detalles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comision_periodo_id UUID NOT NULL REFERENCES public.comision_periodos(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  odoo_invoice_id BIGINT NOT NULL,
  odoo_invoice_name TEXT,
  invoice_date DATE NOT NULL,
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('out_invoice', 'out_refund')),
  currency TEXT NOT NULL DEFAULT 'COP',
  base_sin_iva NUMERIC(16,2) NOT NULL,
  bono NUMERIC(16,2) NOT NULL,
  pedido_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  odoo_sale_order_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comision_periodo_id, empresa_id, odoo_invoice_id)
);

ALTER TABLE public.comision_periodos
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  ADD COLUMN IF NOT EXISTS asesor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS asesor_odoo_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS snapshot JSONB,
  ADD COLUMN IF NOT EXISTS historial JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(historial) = 'array');
ALTER TABLE public.comision_clientes ADD COLUMN IF NOT EXISTS empresa_nombre TEXT;
ALTER TABLE public.comision_detalles
  ADD COLUMN IF NOT EXISTS empresa_nombre TEXT,
  ADD COLUMN IF NOT EXISTS odoo_invoice_line_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[];

ALTER TABLE public.comision_periodos DROP CONSTRAINT IF EXISTS comision_periodos_porcentaje_bono_check;
ALTER TABLE public.comision_periodos ADD CONSTRAINT comision_periodos_porcentaje_bono_check CHECK (porcentaje_bono = 0.50);
ALTER TABLE public.comision_periodos DROP CONSTRAINT IF EXISTS comision_periodos_vigencia_check;
ALTER TABLE public.comision_periodos ADD CONSTRAINT comision_periodos_vigencia_check CHECK (periodo >= DATE '2026-09-01');

UPDATE public.comision_periodos cp
SET asesor_nombre = concat_ws(' ', u.nombre, NULLIF(u.apellido, '')),
    asesor_odoo_user_id = u.odoo_user_id
FROM public.usuarios u
WHERE u.id = cp.asesor_id AND cp.asesor_nombre IS NULL;
UPDATE public.comision_clientes cc SET empresa_nombre = e.nombre
FROM public.empresas e WHERE e.id = cc.empresa_id AND cc.empresa_nombre IS NULL;
UPDATE public.comision_detalles cd SET empresa_nombre = e.nombre
FROM public.empresas e WHERE e.id = cd.empresa_id AND cd.empresa_nombre IS NULL;

CREATE OR REPLACE FUNCTION public.construir_snapshot_bono_plataforma(
  p_periodo_id UUID, p_warnings JSONB, p_legacy BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'advisor', jsonb_build_object('id', cp.asesor_id, 'name', cp.asesor_nombre, 'odooUserId', cp.asesor_odoo_user_id),
    'period', to_char(cp.periodo, 'YYYY-MM'), 'periodDate', cp.periodo,
    'percentage', cp.porcentaje_bono, 'snapshotLegacy', p_legacy,
    'warnings', p_warnings, 'blockingIssues', '[]'::JSONB,
    'totals', jsonb_build_object(
      'activeClients', cp.clientes_activos, 'invoiceCount', cp.facturas_count,
      'creditNoteCount', cp.notas_credito_count, 'invoicedBase', cp.base_facturada,
      'creditNotes', cp.notas_credito, 'netBase', cp.base_neta, 'bonus', cp.bono_total
    ),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cc.empresa_id, 'name', cc.empresa_nombre, 'bonusStartDate', cc.bono_vigente_desde,
        'invoiceCount', cc.facturas_count, 'creditNoteCount', cc.notas_credito_count,
        'invoicedBase', cc.base_facturada, 'creditNotes', cc.notas_credito,
        'netBase', cc.base_neta, 'bonus', cc.bono
      ) ORDER BY cc.bono DESC, cc.empresa_id)
      FROM public.comision_clientes cc WHERE cc.comision_periodo_id = cp.id
    ), '[]'::JSONB),
    'details', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'companyId', cd.empresa_id, 'companyName', cd.empresa_nombre,
        'invoiceId', cd.odoo_invoice_id, 'invoiceName', cd.odoo_invoice_name,
        'invoiceDate', cd.invoice_date, 'documentType', cd.tipo_documento,
        'currency', cd.currency, 'netBase', cd.base_sin_iva, 'bonus', cd.bono,
        'orderIds', cd.pedido_ids, 'saleOrderIds', cd.odoo_sale_order_ids,
        'invoiceLineIds', cd.odoo_invoice_line_ids
      ) ORDER BY cd.invoice_date DESC, cd.odoo_invoice_id DESC, cd.empresa_id)
      FROM public.comision_detalles cd WHERE cd.comision_periodo_id = cp.id
    ), '[]'::JSONB)
  ) FROM public.comision_periodos cp WHERE cp.id = p_periodo_id;
$$;

REVOKE ALL ON FUNCTION public.construir_snapshot_bono_plataforma(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.construir_snapshot_bono_plataforma(UUID, JSONB, BOOLEAN) TO service_role;

UPDATE public.comision_periodos cp
SET snapshot = public.construir_snapshot_bono_plataforma(cp.id, '[]'::JSONB, true),
    version = cp.version + 1,
    historial = cp.historial || jsonb_build_array(jsonb_build_object(
      'action', 'legacy_import', 'version', cp.version + 1, 'at', now(), 'actorId', NULL,
      'previousState', cp.estado, 'state', cp.estado,
      'closedAt', cp.cerrado_at, 'closedBy', cp.cerrado_por,
      'paidAt', cp.pagado_at, 'paidBy', cp.pagado_por,
      'snapshot', public.construir_snapshot_bono_plataforma(cp.id, '[]'::JSONB, true)
    ))
WHERE cp.snapshot IS NULL AND (cp.estado IN ('cerrado', 'pagado') OR cp.snapshot_generado_at IS NOT NULL);

DROP FUNCTION IF EXISTS public.cerrar_periodo_bono_plataforma(UUID, DATE, NUMERIC, JSONB, JSONB, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.cerrar_periodo_bono_plataforma(
  p_asesor_id UUID,
  p_periodo DATE,
  p_porcentaje NUMERIC,
  p_resumen JSONB,
  p_clientes JSONB,
  p_detalles JSONB,
  p_actor_id UUID,
  p_expected_version INTEGER,
  p_blocking_issues JSONB,
  p_warnings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_periodo public.comision_periodos%ROWTYPE;
  v_cliente JSONB;
  v_detalle JSONB;
  v_resumen JSONB;
  v_snapshot JSONB;
  v_asesor_nombre TEXT;
  v_asesor_odoo_user_id BIGINT;
  v_empresa_nombre TEXT;
  v_empresa_id UUID;
  v_base NUMERIC;
  v_bono NUMERIC;
  v_invoice_date DATE;
  v_pedido_ids UUID[];
  v_sale_order_ids BIGINT[];
  v_invoice_line_ids BIGINT[];
BEGIN
  IF p_asesor_id IS NULL OR p_periodo IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_porcentaje IS DISTINCT FROM 0.50 OR EXTRACT(DAY FROM p_periodo) <> 1
    OR p_periodo < DATE '2026-09-01' THEN
    RAISE EXCEPTION USING ERRCODE = 'PB400', MESSAGE = 'Solicitud de cierre inválida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = p_actor_id AND u.activo = true
      AND (public.usuario_tiene_rol_o_extra(u.id, 'direccion') OR public.usuario_tiene_rol_o_extra(u.id, 'super_admin'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PB403', MESSAGE = 'Actor no autorizado';
  END IF;
  IF p_periodo >= date_trunc('month', now() AT TIME ZONE 'America/Bogota')::DATE THEN
    RAISE EXCEPTION USING ERRCODE = 'PB411', MESSAGE = 'El periodo no ha terminado';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('bono-plataforma-cierre', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_asesor_id::TEXT || ':' || p_periodo::TEXT, 0));
  SELECT * INTO v_periodo FROM public.comision_periodos
  WHERE asesor_id = p_asesor_id AND periodo = p_periodo FOR UPDATE;
  IF COALESCE(v_periodo.version, 0) <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'PB409', MESSAGE = 'La versión de la liquidación cambió';
  END IF;
  IF v_periodo.id IS NOT NULL AND v_periodo.estado <> 'provisional' THEN
    RAISE EXCEPTION USING ERRCODE = 'PB410', MESSAGE = 'La liquidación no es provisional';
  END IF;

  SELECT concat_ws(' ', u.nombre, NULLIF(u.apellido, '')), u.odoo_user_id
  INTO v_asesor_nombre, v_asesor_odoo_user_id FROM public.usuarios u
  WHERE u.id = p_asesor_id AND (
    u.rol = 'asesor' OR EXISTS (
      SELECT 1 FROM public.usuario_roles_extra ure
      WHERE ure.usuario_id = u.id AND ure.rol = 'asesor' AND ure.activo = true
    )
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PB404', MESSAGE = 'Asesora no encontrada';
  END IF;
  IF jsonb_typeof(p_blocking_issues) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Falta verificación de integridad del cálculo';
  END IF;
  IF jsonb_array_length(p_blocking_issues) <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'PB423', MESSAGE = 'El cálculo tiene incidencias bloqueantes';
  END IF;
  IF jsonb_typeof(p_resumen) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_clientes) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_detalles) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_warnings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Snapshot inválido';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_warnings) w WHERE jsonb_typeof(w) <> 'string') THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Advertencias inválidas';
  END IF;
  IF v_periodo.id IS NULL THEN
    INSERT INTO public.comision_periodos (asesor_id, periodo) VALUES (p_asesor_id, p_periodo)
    RETURNING * INTO v_periodo;
  END IF;

  IF v_periodo.snapshot IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_periodo.historial) h WHERE h->'snapshot' = v_periodo.snapshot
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'El cierre previo no está archivado';
  END IF;
  DELETE FROM public.comision_detalles WHERE comision_periodo_id = v_periodo.id;
  DELETE FROM public.comision_clientes WHERE comision_periodo_id = v_periodo.id;

  FOR v_cliente IN SELECT value FROM jsonb_array_elements(p_clientes) LOOP
    IF jsonb_typeof(v_cliente) IS DISTINCT FROM 'object'
      OR (v_cliente->>'bono_vigente_desde')::DATE < DATE '2026-09-01'
      OR (v_cliente->>'bono_vigente_desde')::DATE >= (p_periodo + INTERVAL '1 month')::DATE THEN
      RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Cliente o vigencia inválidos';
    END IF;
    INSERT INTO public.comision_clientes (comision_periodo_id, empresa_id, empresa_nombre, bono_vigente_desde)
    SELECT v_periodo.id, e.id, e.nombre, (v_cliente->>'bono_vigente_desde')::DATE
    FROM public.empresas e WHERE e.id = (v_cliente->>'empresa_id')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Empresa no encontrada';
    END IF;
  END LOOP;

  FOR v_detalle IN SELECT value FROM jsonb_array_elements(p_detalles) LOOP
    IF jsonb_typeof(v_detalle) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_detalle->'base_sin_iva') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_detalle->'bono') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_detalle->'pedido_ids') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_detalle->'odoo_sale_order_ids') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_detalle->'odoo_invoice_line_ids') IS DISTINCT FROM 'array'
      OR v_detalle->>'currency' IS DISTINCT FROM 'COP'
      OR NULLIF(btrim(v_detalle->>'odoo_invoice_name'), '') IS NULL
      OR COALESCE((v_detalle->>'odoo_invoice_id')::BIGINT, 0) <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Documento o trazabilidad inválidos';
    END IF;
    v_empresa_id := (v_detalle->>'empresa_id')::UUID;
    v_invoice_date := (v_detalle->>'invoice_date')::DATE;
    v_base := (v_detalle->>'base_sin_iva')::NUMERIC;
    v_bono := round(v_base * 0.005, 2);
    SELECT empresa_nombre INTO v_empresa_nombre FROM public.comision_clientes
    WHERE comision_periodo_id = v_periodo.id AND empresa_id = v_empresa_id
      AND bono_vigente_desde <= v_invoice_date;
    IF NOT FOUND OR v_invoice_date IS NULL OR v_invoice_date < p_periodo
      OR v_invoice_date >= (p_periodo + INTERVAL '1 month')::DATE
      OR v_base <> round(v_base, 2)
      OR (v_detalle->>'bono')::NUMERIC IS DISTINCT FROM v_bono
      OR v_detalle->>'tipo_documento' IS NULL
      OR v_detalle->>'tipo_documento' NOT IN ('out_invoice', 'out_refund') THEN
      RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Detalle fuera de vigencia o importe inconsistente';
    END IF;
    v_pedido_ids := ARRAY(SELECT value::UUID FROM jsonb_array_elements_text(v_detalle->'pedido_ids'));
    v_sale_order_ids := ARRAY(SELECT value::BIGINT FROM jsonb_array_elements_text(v_detalle->'odoo_sale_order_ids'));
    v_invoice_line_ids := ARRAY(SELECT value::BIGINT FROM jsonb_array_elements_text(v_detalle->'odoo_invoice_line_ids'));
    IF cardinality(v_pedido_ids) = 0 OR cardinality(v_sale_order_ids) = 0 OR cardinality(v_invoice_line_ids) = 0
      OR EXISTS (SELECT 1 FROM unnest(v_pedido_ids) i WHERE i IS NULL)
      OR EXISTS (SELECT 1 FROM unnest(v_sale_order_ids || v_invoice_line_ids) i WHERE i IS NULL OR i <= 0)
      OR cardinality(v_pedido_ids) <> (SELECT count(DISTINCT i) FROM unnest(v_pedido_ids) i)
      OR cardinality(v_sale_order_ids) <> (SELECT count(DISTINCT i) FROM unnest(v_sale_order_ids) i)
      OR cardinality(v_invoice_line_ids) <> (SELECT count(DISTINCT i) FROM unnest(v_invoice_line_ids) i)
      OR EXISTS (
        SELECT 1 FROM public.comision_detalles cd
        JOIN public.comision_periodos cp ON cp.id = cd.comision_periodo_id
        WHERE (cp.id = v_periodo.id OR cp.estado IN ('cerrado', 'pagado'))
          AND cd.odoo_invoice_line_ids && v_invoice_line_ids
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Identificadores ausentes o duplicados';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_pedido_ids) pedido_id
      LEFT JOIN public.pedidos p ON p.id = pedido_id
      WHERE p.id IS NULL OR p.empresa_id <> v_empresa_id OR p.odoo_sale_order_id IS NULL
        OR NOT (p.odoo_sale_order_id = ANY(v_sale_order_ids))
    ) OR EXISTS (
      SELECT 1 FROM unnest(v_sale_order_ids) sale_order_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.pedidos p WHERE p.id = ANY(v_pedido_ids)
          AND p.empresa_id = v_empresa_id AND p.odoo_sale_order_id = sale_order_id
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'El documento no corresponde a pedidos del portal';
    END IF;
    INSERT INTO public.comision_detalles (
      comision_periodo_id, empresa_id, empresa_nombre, odoo_invoice_id, odoo_invoice_name,
      invoice_date, tipo_documento, currency, base_sin_iva, bono,
      pedido_ids, odoo_sale_order_ids, odoo_invoice_line_ids
    ) VALUES (
      v_periodo.id, v_empresa_id, v_empresa_nombre, (v_detalle->>'odoo_invoice_id')::BIGINT,
      v_detalle->>'odoo_invoice_name', v_invoice_date, v_detalle->>'tipo_documento',
      v_detalle->>'currency', v_base, v_bono, v_pedido_ids, v_sale_order_ids, v_invoice_line_ids
    );
  END LOOP;

  IF (SELECT count(DISTINCT currency) FROM public.comision_detalles WHERE comision_periodo_id = v_periodo.id) > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'El snapshot mezcla monedas';
  END IF;
  WITH agregados AS (
    SELECT cc.id,
      count(cd.id) FILTER (WHERE cd.tipo_documento = 'out_invoice') AS facturas_count,
      count(cd.id) FILTER (WHERE cd.tipo_documento = 'out_refund') AS notas_credito_count,
      COALESCE(sum(cd.base_sin_iva) FILTER (WHERE cd.tipo_documento = 'out_invoice'), 0) AS base_facturada,
      COALESCE(-sum(cd.base_sin_iva) FILTER (WHERE cd.tipo_documento = 'out_refund'), 0) AS notas_credito
    FROM public.comision_clientes cc
    LEFT JOIN public.comision_detalles cd ON cd.comision_periodo_id = cc.comision_periodo_id AND cd.empresa_id = cc.empresa_id
    WHERE cc.comision_periodo_id = v_periodo.id GROUP BY cc.id
  )
  UPDATE public.comision_clientes cc
  SET facturas_count = a.facturas_count, notas_credito_count = a.notas_credito_count,
      base_facturada = a.base_facturada, notas_credito = a.notas_credito,
      base_neta = GREATEST(a.base_facturada - a.notas_credito, 0),
      bono = round(GREATEST(a.base_facturada - a.notas_credito, 0) * 0.005, 2)
  FROM agregados a WHERE cc.id = a.id;

  IF EXISTS (
    SELECT 1 FROM public.comision_clientes
    WHERE comision_periodo_id = v_periodo.id AND notas_credito > base_facturada
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PB423', MESSAGE = 'Los ajustes exceden la base del periodo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_clientes) c
    JOIN public.comision_clientes cc ON cc.empresa_id = (c->>'empresa_id')::UUID AND cc.comision_periodo_id = v_periodo.id
    WHERE ROW(cc.facturas_count, cc.notas_credito_count, cc.base_facturada, cc.notas_credito, cc.base_neta, cc.bono)
      IS DISTINCT FROM ROW(
        (c->>'facturas_count')::INTEGER, (c->>'notas_credito_count')::INTEGER,
        (c->>'base_facturada')::NUMERIC, (c->>'notas_credito')::NUMERIC,
        (c->>'base_neta')::NUMERIC, (c->>'bono')::NUMERIC
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Los agregados por empresa no corresponden a los detalles';
  END IF;
  SELECT jsonb_build_object(
    'active_clients', count(*), 'invoice_count', COALESCE(sum(facturas_count), 0),
    'credit_note_count', COALESCE(sum(notas_credito_count), 0),
    'invoiced_base', COALESCE(sum(base_facturada), 0), 'credit_notes', COALESCE(sum(notas_credito), 0),
    'net_base', COALESCE(sum(base_neta), 0), 'bonus', COALESCE(sum(bono), 0)
  ) INTO v_resumen FROM public.comision_clientes WHERE comision_periodo_id = v_periodo.id;
  IF p_resumen IS DISTINCT FROM v_resumen THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'El resumen no corresponde a los detalles';
  END IF;

  UPDATE public.comision_periodos
  SET estado = 'cerrado', porcentaje_bono = 0.50,
      asesor_nombre = v_asesor_nombre, asesor_odoo_user_id = v_asesor_odoo_user_id,
      clientes_activos = (v_resumen->>'active_clients')::INTEGER,
      facturas_count = (v_resumen->>'invoice_count')::INTEGER,
      notas_credito_count = (v_resumen->>'credit_note_count')::INTEGER,
      base_facturada = (v_resumen->>'invoiced_base')::NUMERIC,
      notas_credito = (v_resumen->>'credit_notes')::NUMERIC,
      base_neta = (v_resumen->>'net_base')::NUMERIC, bono_total = (v_resumen->>'bonus')::NUMERIC,
      snapshot_generado_at = now(), cerrado_at = now(), cerrado_por = p_actor_id,
      pagado_at = NULL, pagado_por = NULL, version = version + 1, updated_at = now()
  WHERE id = v_periodo.id AND version = p_expected_version AND estado = 'provisional'
  RETURNING * INTO v_periodo;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PB409', MESSAGE = 'La liquidación cambió durante el cierre';
  END IF;
  v_snapshot := public.construir_snapshot_bono_plataforma(v_periodo.id, p_warnings, false);
  UPDATE public.comision_periodos
  SET snapshot = v_snapshot,
      historial = historial || jsonb_build_array(jsonb_build_object(
        'action', 'close', 'version', v_periodo.version, 'at', now(), 'actorId', p_actor_id,
        'previousState', 'provisional', 'state', 'cerrado', 'snapshot', v_snapshot
      ))
  WHERE id = v_periodo.id;
  RETURN jsonb_build_object('ok', true, 'periodId', v_periodo.id, 'version', v_periodo.version,
    'updatedAt', v_periodo.updated_at, 'status', v_periodo.estado);
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow
    OR invalid_datetime_format OR not_null_violation OR check_violation OR unique_violation
    OR foreign_key_violation OR invalid_parameter_value THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Snapshot inválido o inconsistente';
END;
$$;

CREATE OR REPLACE FUNCTION public.transicionar_periodo_bono_plataforma(
  p_asesor_id UUID, p_periodo DATE, p_action TEXT, p_actor_id UUID, p_expected_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_periodo public.comision_periodos%ROWTYPE;
  v_estado TEXT;
BEGIN
  IF p_asesor_id IS NULL OR p_periodo IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_action IS NULL OR p_action NOT IN ('reopen', 'mark_paid')
    OR EXTRACT(DAY FROM p_periodo) <> 1 OR p_periodo < DATE '2026-09-01' THEN
    RAISE EXCEPTION USING ERRCODE = 'PB400', MESSAGE = 'Transición inválida';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = p_actor_id AND u.activo = true
      AND (public.usuario_tiene_rol_o_extra(u.id, 'direccion') OR public.usuario_tiene_rol_o_extra(u.id, 'super_admin'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PB403', MESSAGE = 'Actor no autorizado';
  END IF;
  IF p_periodo >= date_trunc('month', now() AT TIME ZONE 'America/Bogota')::DATE THEN
    RAISE EXCEPTION USING ERRCODE = 'PB411', MESSAGE = 'El periodo no ha terminado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_asesor_id::TEXT || ':' || p_periodo::TEXT, 0));
  SELECT * INTO v_periodo FROM public.comision_periodos
  WHERE asesor_id = p_asesor_id AND periodo = p_periodo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PB404', MESSAGE = 'Liquidación no encontrada';
  END IF;
  IF v_periodo.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'PB409', MESSAGE = 'La versión de la liquidación cambió';
  END IF;
  IF v_periodo.estado <> 'cerrado' THEN
    RAISE EXCEPTION USING ERRCODE = 'PB410', MESSAGE = 'La liquidación no está cerrada';
  END IF;
  IF v_periodo.snapshot IS NULL OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_periodo.historial) h WHERE h->'snapshot' = v_periodo.snapshot
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PB422', MESSAGE = 'Falta el snapshot archivado';
  END IF;
  v_estado := CASE p_action WHEN 'reopen' THEN 'provisional' ELSE 'pagado' END;
  UPDATE public.comision_periodos
  SET estado = v_estado, version = version + 1, updated_at = now(),
      cerrado_at = CASE WHEN p_action = 'reopen' THEN NULL ELSE cerrado_at END,
      cerrado_por = CASE WHEN p_action = 'reopen' THEN NULL ELSE cerrado_por END,
      pagado_at = CASE WHEN p_action = 'mark_paid' THEN now() ELSE NULL END,
      pagado_por = CASE WHEN p_action = 'mark_paid' THEN p_actor_id ELSE NULL END,
      historial = historial || jsonb_build_array(jsonb_build_object(
        'action', p_action, 'version', version + 1, 'at', now(), 'actorId', p_actor_id,
        'previousState', 'cerrado', 'state', v_estado
      ))
  WHERE id = v_periodo.id AND estado = 'cerrado' AND version = p_expected_version
  RETURNING * INTO v_periodo;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PB409', MESSAGE = 'La liquidación cambió durante la transición';
  END IF;
  RETURN jsonb_build_object('ok', true, 'periodId', v_periodo.id, 'version', v_periodo.version,
    'updatedAt', v_periodo.updated_at, 'status', v_periodo.estado);
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_periodo_bono_plataforma(UUID, DATE, NUMERIC, JSONB, JSONB, JSONB, UUID, INTEGER, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_periodo_bono_plataforma(UUID, DATE, NUMERIC, JSONB, JSONB, JSONB, UUID, INTEGER, JSONB, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.transicionar_periodo_bono_plataforma(UUID, DATE, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transicionar_periodo_bono_plataforma(UUID, DATE, TEXT, UUID, INTEGER) TO service_role;

CREATE INDEX IF NOT EXISTS idx_comision_periodos_periodo ON public.comision_periodos(periodo DESC);
CREATE INDEX IF NOT EXISTS idx_comision_periodos_asesor ON public.comision_periodos(asesor_id, periodo DESC);
CREATE INDEX IF NOT EXISTS idx_comision_clientes_periodo ON public.comision_clientes(comision_periodo_id);
CREATE INDEX IF NOT EXISTS idx_comision_detalles_periodo ON public.comision_detalles(comision_periodo_id);
CREATE INDEX IF NOT EXISTS idx_comision_detalles_empresa ON public.comision_detalles(empresa_id, invoice_date DESC);

DROP TRIGGER IF EXISTS trigger_comision_periodos_updated_at ON public.comision_periodos;
CREATE TRIGGER trigger_comision_periodos_updated_at
  BEFORE UPDATE ON public.comision_periodos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.comision_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_detalles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comision_periodos_select" ON public.comision_periodos;
CREATE POLICY "comision_periodos_select" ON public.comision_periodos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = public.get_mi_usuario_id() AND u.activo = true)
    AND (
      public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'super_admin')
      OR public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'direccion')
      OR (asesor_id = public.get_mi_usuario_id() AND public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'asesor'))
    )
  );

DROP POLICY IF EXISTS "comision_clientes_select" ON public.comision_clientes;
CREATE POLICY "comision_clientes_select" ON public.comision_clientes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.comision_periodos cp WHERE cp.id = comision_periodo_id)
  );

DROP POLICY IF EXISTS "comision_detalles_select" ON public.comision_detalles;
CREATE POLICY "comision_detalles_select" ON public.comision_detalles
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.comision_periodos cp WHERE cp.id = comision_periodo_id)
  );

REVOKE ALL ON public.comision_periodos, public.comision_clientes, public.comision_detalles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.comision_periodos, public.comision_clientes, public.comision_detalles TO authenticated, service_role;

COMMIT;
