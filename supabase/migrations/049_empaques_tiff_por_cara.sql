BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

DO $$
DECLARE
  v_tabla TEXT;
  v_columna RECORD;
  v_extra JSONB;
  v_ruta TEXT[];
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'public.leads', 'public.lead_empaques_personalizados',
    'public.storefront_configs', 'storage.buckets'
  ] LOOP
    IF to_regclass(v_tabla) IS NULL THEN
      RAISE EXCEPTION 'Falta %. Se requieren las migraciones 021, 036, 037 y 046 antes de 049.', v_tabla;
    END IF;
  END LOOP;

  FOR v_columna IN
    SELECT * FROM (VALUES
      ('public.leads', 'id', 'uuid'),
      ('public.leads', 'nombre', 'text'),
      ('public.leads', 'empresa', 'text'),
      ('public.leads', 'email', 'text'),
      ('public.leads', 'telefono', 'text'),
      ('public.leads', 'mensaje', 'text'),
      ('public.leads', 'fuente', 'text'),
      ('public.leads', 'estado', 'text'),
      ('public.leads', 'whatsapp_enviado', 'boolean'),
      ('public.leads', 'gclid', 'text'),
      ('public.leads', 'utm_source', 'text'),
      ('public.leads', 'utm_medium', 'text'),
      ('public.leads', 'utm_campaign', 'text'),
      ('public.leads', 'utm_term', 'text'),
      ('public.leads', 'utm_content', 'text'),
      ('public.leads', 'referrer', 'text'),
      ('public.leads', 'landing_url', 'text'),
      ('public.leads', 'click_at', 'timestamp with time zone'),
      ('public.lead_empaques_personalizados', 'lead_id', 'uuid'),
      ('public.lead_empaques_personalizados', 'storefront_config_id', 'uuid'),
      ('public.lead_empaques_personalizados', 'tipo_empaque', 'text'),
      ('public.lead_empaques_personalizados', 'uso_producto', 'text'),
      ('public.lead_empaques_personalizados', 'medida_largo', 'numeric'),
      ('public.lead_empaques_personalizados', 'medida_ancho', 'numeric'),
      ('public.lead_empaques_personalizados', 'medida_alto', 'numeric'),
      ('public.lead_empaques_personalizados', 'unidad_medida', 'text'),
      ('public.lead_empaques_personalizados', 'material', 'text'),
      ('public.lead_empaques_personalizados', 'impresion', 'text'),
      ('public.lead_empaques_personalizados', 'cantidad', 'integer'),
      ('public.lead_empaques_personalizados', 'ciudad_entrega', 'text'),
      ('public.lead_empaques_personalizados', 'fecha_requerida', 'date'),
      ('public.lead_empaques_personalizados', 'comentarios', 'text'),
      ('public.lead_empaques_personalizados', 'request_hash', 'text'),
      ('public.lead_empaques_personalizados', 'archivos', 'jsonb'),
      ('public.storefront_configs', 'id', 'uuid'),
      ('public.storefront_configs', 'slug', 'text'),
      ('public.storefront_configs', 'activo', 'boolean'),
      ('public.storefront_configs', 'configuracion_extra', 'jsonb'),
      ('storage.buckets', 'id', 'text'),
      ('storage.buckets', 'public', 'boolean'),
      ('storage.buckets', 'file_size_limit', 'bigint'),
      ('storage.buckets', 'allowed_mime_types', 'text[]')
    ) AS requeridas(tabla, columna, tipo)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = to_regclass(v_columna.tabla)
        AND attname = v_columna.columna
        AND atttypid = to_regtype(v_columna.tipo)
        AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Falta %.% con tipo %. No se aplicó 049.',
        v_columna.tabla, v_columna.columna, v_columna.tipo;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND rolbypassrls)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
        AND rolname NOT IN ('anon', 'authenticated', 'service_role')
    ) THEN
    RAISE EXCEPTION '049 requiere roles Supabase y ejecución por un propietario confiable con BYPASSRLS.';
  END IF;

  IF to_regclass('public.empaques_tiff_cargas') IS NOT NULL
    OR to_regprocedure('public.reservar_empaques_tiff(uuid,text,text,text,text,text,bigint,numeric,numeric)') IS NOT NULL
    OR to_regprocedure('public.registrar_empaques_tiff(uuid,jsonb,jsonb)') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.lead_empaques_personalizados'::regclass
        AND attname = ANY (ARRAY['solicitud_id', 'referencia_sku', 'impresion_sku', 'modalidad', 'caras', 'area_alto_cm', 'area_ancho_cm'])
        AND attnum > 0 AND NOT attisdropped
    ) THEN
    RAISE EXCEPTION '049 ya existe total o parcialmente. Revisar el esquema antes de continuar.';
  END IF;

  PERFORM 1 FROM storage.buckets WHERE id = 'empaques-solicitudes' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta el bucket empaques-solicitudes de 046. No se aplicó 049.';
  END IF;

  SELECT configuracion_extra INTO v_extra
  FROM public.storefront_configs WHERE slug = 'empaques' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta storefront_configs.slug = empaques. No se aplicó 049.';
  END IF;

  IF v_extra IS NOT NULL AND jsonb_typeof(v_extra) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'configuracion_extra de Empaques debe ser un objeto JSON. No se reemplazó su contenido.';
  END IF;
  FOREACH v_ruta SLICE 1 IN ARRAY ARRAY[['landing', NULL], ['landing', 'personalizados']] LOOP
    v_ruta := array_remove(v_ruta, NULL);
    IF v_extra #> v_ruta IS NOT NULL AND jsonb_typeof(v_extra #> v_ruta) NOT IN ('object', 'null') THEN
      RAISE EXCEPTION 'La ruta % de Empaques no es un objeto JSON. No se reemplazó su contenido.', v_ruta;
    END IF;
  END LOOP;
  IF v_extra #> '{landing,personalizados,referencias}' IS NOT NULL
    AND jsonb_typeof(v_extra #> '{landing,personalizados,referencias}') NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'Las referencias existentes no son un array JSON. No se reemplazó su contenido.';
  END IF;
END;
$$;

UPDATE public.storefront_configs
SET configuracion_extra = jsonb_set(
  COALESCE(NULLIF(configuracion_extra, 'null'::jsonb), '{}'::jsonb),
  '{landing}',
  COALESCE(NULLIF(configuracion_extra -> 'landing', 'null'::jsonb), '{}'::jsonb)
    || jsonb_build_object('personalizados',
      COALESCE(NULLIF(configuracion_extra #> '{landing,personalizados}', 'null'::jsonb), '{}'::jsonb)
        || jsonb_build_object('referencias', '[
          {"sku":"2300100156","nombre":"Quadseal kraft 250 g","alto_cm":15,"ancho_cm":12.5,"activo":true},
          {"sku":"2300100157","nombre":"Quadseal kraft 500 g","alto_cm":21,"ancho_cm":13,"activo":true},
          {"sku":"2300100158","nombre":"Quadseal kraft 1.000 g","alto_cm":28,"ancho_cm":14.8,"activo":true},
          {"sku":"2300100112","nombre":"Flex Up kraft con válvula y zipper 250 g","alto_cm":20,"ancho_cm":16,"activo":true},
          {"sku":"2300100042","nombre":"Flex Up kraft con válvula y zipper 500 g","alto_cm":21,"ancho_cm":19,"activo":true},
          {"sku":"2300100026","nombre":"Flex Up kraft con válvula y zipper 2.500 g","alto_cm":33,"ancho_cm":33,"activo":true}
        ]'::jsonb)),
  true
)
WHERE slug = 'empaques'
  AND (
    configuracion_extra #> '{landing,personalizados,referencias}' IS NULL
    OR configuracion_extra #> '{landing,personalizados,referencias}' IN ('null'::jsonb, '[]'::jsonb)
  );

UPDATE storage.buckets AS b
SET public = false,
    file_size_limit = 104857600,
    allowed_mime_types = ARRAY(
      SELECT DISTINCT mime
      FROM unnest(COALESCE(b.allowed_mime_types, ARRAY[]::text[])
        || ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/tiff']) AS tipos(mime)
      WHERE mime IS NOT NULL
      ORDER BY mime
    )
WHERE b.id = 'empaques-solicitudes';

CREATE TABLE public.empaques_tiff_cargas (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  referencia_sku TEXT NOT NULL CHECK (referencia_sku IN ('2300100156', '2300100157', '2300100158', '2300100112', '2300100042', '2300100026')),
  cara TEXT NOT NULL CHECK (cara IN ('frente', 'reverso')),
  nombre TEXT NOT NULL CHECK (
    char_length(nombre) BETWEEN 1 AND 180 AND nombre = btrim(nombre)
    AND nombre !~ '[[:cntrl:]/]' AND position(chr(92) IN nombre) = 0
    AND nombre ~* '\.tiff?$'
  ),
  tamano_declarado BIGINT NOT NULL CHECK (tamano_declarado BETWEEN 1 AND 104857600),
  original_path TEXT NOT NULL UNIQUE CHECK (original_path = 'tiff/' || id::text || '/original.tiff'),
  preview_path TEXT CHECK (preview_path = 'tiff/' || id::text || '/preview.png'),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'validando', 'validado', 'rechazado', 'usado')),
  area_alto_cm NUMERIC NOT NULL CHECK (area_alto_cm > 0 AND area_alto_cm <= 100),
  area_ancho_cm NUMERIC NOT NULL CHECK (area_ancho_cm > 0 AND area_ancho_cm <= 100),
  validacion JSONB CHECK (validacion IS NULL OR jsonb_typeof(validacion) = 'object'),
  sha256 TEXT CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  claim_at TIMESTAMPTZ,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT empaques_tiff_cargas_vigencia CHECK (isfinite(expires_at) AND isfinite(created_at) AND expires_at > created_at),
  CONSTRAINT empaques_tiff_cargas_uso CHECK ((estado = 'usado') = (lead_id IS NOT NULL)),
  CONSTRAINT empaques_tiff_cargas_validado CHECK (
    estado NOT IN ('validado', 'usado') OR (
      preview_path IS NOT NULL AND sha256 IS NOT NULL AND validacion IS NOT NULL
      AND CASE WHEN jsonb_typeof(validacion -> 'ppp_efectivos') = 'number'
        THEN (validacion ->> 'ppp_efectivos')::numeric >= 150
        ELSE false END
    )
  )
);

CREATE INDEX idx_empaques_tiff_cargas_request_created ON public.empaques_tiff_cargas(request_hash, created_at DESC);
CREATE INDEX idx_empaques_tiff_cargas_created ON public.empaques_tiff_cargas(created_at DESC);
CREATE INDEX idx_empaques_tiff_cargas_lead ON public.empaques_tiff_cargas(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_empaques_tiff_cargas_expires ON public.empaques_tiff_cargas(expires_at) WHERE estado <> 'usado';

ALTER TABLE public.empaques_tiff_cargas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.empaques_tiff_cargas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE, DELETE ON TABLE public.empaques_tiff_cargas TO service_role;

ALTER TABLE public.lead_empaques_personalizados
  ADD COLUMN solicitud_id UUID UNIQUE,
  ADD COLUMN referencia_sku TEXT CHECK (referencia_sku IN ('2300100156', '2300100157', '2300100158', '2300100112', '2300100042', '2300100026')),
  ADD COLUMN impresion_sku TEXT CHECK (impresion_sku IN ('2300100105', '2300100190', '2300100191')),
  ADD COLUMN modalidad TEXT CHECK (modalidad IN ('produccion', 'muestra')),
  ADD COLUMN caras SMALLINT CHECK (caras IN (1, 2)),
  ADD COLUMN area_alto_cm NUMERIC CHECK (area_alto_cm > 0 AND area_alto_cm <= 100),
  ADD COLUMN area_ancho_cm NUMERIC CHECK (area_ancho_cm > 0 AND area_ancho_cm <= 100),
  ADD CONSTRAINT lead_empaques_tiff_servicio CHECK (
    solicitud_id IS NULL OR (
      referencia_sku IS NOT NULL AND impresion_sku IS NOT NULL AND modalidad IS NOT NULL
      AND caras IS NOT NULL AND area_alto_cm IS NOT NULL AND area_ancho_cm IS NOT NULL
      AND medida_largo IS NULL AND medida_ancho IS NULL AND medida_alto IS NULL
      AND impresion_sku = CASE
        WHEN modalidad = 'muestra' THEN '2300100191'
        WHEN caras = 1 THEN '2300100105'
        ELSE '2300100190'
      END
    )
  );

CREATE FUNCTION public.reservar_empaques_tiff(
  p_id UUID,
  p_token_hash TEXT,
  p_request_hash TEXT,
  p_sku TEXT,
  p_cara TEXT,
  p_nombre TEXT,
  p_tamano BIGINT,
  p_alto_cm NUMERIC,
  p_ancho_cm NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_now TIMESTAMPTZ;
BEGIN
  IF p_id IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
    OR p_sku IS NULL OR p_sku NOT IN ('2300100156', '2300100157', '2300100158', '2300100112', '2300100042', '2300100026')
    OR p_cara IS NULL OR p_cara NOT IN ('frente', 'reverso')
    OR p_tamano IS NULL OR p_tamano NOT BETWEEN 1 AND 104857600
    OR p_alto_cm IS NULL OR NOT (p_alto_cm > 0 AND p_alto_cm <= 100)
    OR p_ancho_cm IS NULL OR NOT (p_ancho_cm > 0 AND p_ancho_cm <= 100)
    OR p_nombre IS NULL OR char_length(p_nombre) NOT BETWEEN 1 AND 180
    OR p_nombre <> btrim(p_nombre) OR p_nombre ~ '[[:cntrl:]/]'
    OR position(chr(92) IN p_nombre) > 0 OR p_nombre !~* '\.tiff?$'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Parámetros de reserva TIFF inválidos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storefront_configs AS sc
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(sc.configuracion_extra #> '{landing,personalizados,referencias}') = 'array'
        THEN sc.configuracion_extra #> '{landing,personalizados,referencias}' ELSE '[]'::jsonb END
    ) AS referencias(ref)
    WHERE sc.slug = 'empaques' AND sc.activo
      AND (sc.configuracion_extra #> '{landing,personalizados,activo}') IS DISTINCT FROM 'false'::jsonb
      AND ref @> jsonb_build_object('sku', p_sku, 'activo', true, 'alto_cm', p_alto_cm, 'ancho_cm', p_ancho_cm)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Referencia o área de impresión no disponible.';
  END IF;

  PERFORM pg_advisory_xact_lock(490049, 0);
  PERFORM pg_advisory_xact_lock(490050, hashtext(p_request_hash));
  v_now := clock_timestamp();

  IF EXISTS (SELECT 1 FROM public.empaques_tiff_cargas WHERE id = p_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'El identificador de carga ya fue reservado.';
  END IF;
  IF (SELECT count(*) FROM public.empaques_tiff_cargas
      WHERE request_hash = p_request_hash AND created_at >= v_now - INTERVAL '30 minutes') >= 12 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT429', MESSAGE = 'Límite de 12 cargas por origen en 30 minutos alcanzado.';
  END IF;
  IF (SELECT count(*) FROM public.empaques_tiff_cargas
      WHERE created_at >= v_now - INTERVAL '24 hours') >= 500 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT429', MESSAGE = 'Límite global de 500 cargas en 24 horas alcanzado.';
  END IF;

  INSERT INTO public.empaques_tiff_cargas (
    id, token_hash, request_hash, referencia_sku, cara, nombre, tamano_declarado,
    original_path, estado, area_alto_cm, area_ancho_cm, expires_at, created_at
  ) VALUES (
    p_id, p_token_hash, p_request_hash, p_sku, p_cara, p_nombre, p_tamano,
    'tiff/' || p_id::text || '/original.tiff', 'pendiente', p_alto_cm, p_ancho_cm,
    v_now + INTERVAL '2 hours', v_now
  );
  RETURN p_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'El identificador o la ruta de carga ya existe.';
END;
$$;

CREATE FUNCTION public.registrar_empaques_tiff(
  p_solicitud_id UUID,
  p_payload JSONB,
  p_archivos JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_campo RECORD;
  v_key TEXT;
  v_archivo JSONB;
  v_ids UUID[];
  v_carga public.empaques_tiff_cargas%ROWTYPE;
  v_cargas public.empaques_tiff_cargas[] := ARRAY[]::public.empaques_tiff_cargas[];
  v_existente public.lead_empaques_personalizados%ROWTYPE;
  v_attribution JSONB;
  v_storefront UUID;
  v_caras SMALLINT;
  v_cantidad INTEGER;
  v_alto NUMERIC;
  v_ancho NUMERIC;
  v_fecha DATE;
  v_click TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_usados INTEGER := 0;
  v_frentes INTEGER := 0;
  v_reversos INTEGER := 0;
  v_lead_usado UUID;
  v_lead_id UUID;
  v_archivos JSONB := '[]'::jsonb;
BEGIN
  IF p_solicitud_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 20000
    OR jsonb_typeof(p_archivos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Solicitud o archivos TIFF inválidos.';
  END IF;
  IF jsonb_array_length(p_archivos) NOT BETWEEN 1 AND 2
    OR p_payload - ARRAY[
      'nombre', 'empresa', 'email', 'telefono', 'mensaje', 'storefront_config_id',
      'tipo_empaque', 'uso_producto', 'material', 'impresion', 'cantidad',
      'ciudad_entrega', 'fecha_requerida', 'comentarios', 'referencia_sku',
      'impresion_sku', 'modalidad', 'caras', 'area_alto_cm', 'area_ancho_cm',
      'request_hash', 'whatsapp_enviado', 'attribution'
    ] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Campos de solicitud o número de archivos inválidos.';
  END IF;

  FOR v_campo IN
    SELECT * FROM (VALUES
      ('nombre', 2, 120), ('empresa', 0, 160), ('email', 0, 180),
      ('telefono', 0, 50), ('mensaje', 0, 5000), ('storefront_config_id', 36, 36),
      ('tipo_empaque', 2, 120), ('uso_producto', 2, 500), ('material', 0, 120),
      ('impresion', 0, 120), ('ciudad_entrega', 0, 120), ('fecha_requerida', 0, 10),
      ('comentarios', 0, 2000), ('referencia_sku', 10, 10), ('impresion_sku', 10, 10),
      ('modalidad', 7, 10), ('request_hash', 64, 64)
    ) AS campos(nombre, minimo, maximo)
  LOOP
    IF (v_campo.minimo > 0 AND jsonb_typeof(p_payload -> v_campo.nombre) IS DISTINCT FROM 'string')
      OR (p_payload -> v_campo.nombre IS NOT NULL AND jsonb_typeof(p_payload -> v_campo.nombre) NOT IN ('string', 'null'))
      OR char_length(btrim(COALESCE(p_payload ->> v_campo.nombre, ''))) NOT BETWEEN v_campo.minimo AND v_campo.maximo THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Campo inválido: ' || v_campo.nombre;
    END IF;
  END LOOP;

  IF (NULLIF(btrim(p_payload ->> 'email'), '') IS NULL AND NULLIF(btrim(p_payload ->> 'telefono'), '') IS NULL)
    OR (NULLIF(btrim(p_payload ->> 'email'), '') IS NOT NULL AND btrim(p_payload ->> 'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR p_payload ->> 'request_hash' !~ '^[0-9a-f]{64}$'
    OR p_payload ->> 'referencia_sku' NOT IN ('2300100156', '2300100157', '2300100158', '2300100112', '2300100042', '2300100026')
    OR p_payload ->> 'modalidad' NOT IN ('produccion', 'muestra')
    OR jsonb_typeof(p_payload -> 'caras') IS DISTINCT FROM 'number'
    OR p_payload -> 'caras' NOT IN ('1'::jsonb, '2'::jsonb)
    OR jsonb_typeof(p_payload -> 'cantidad') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_payload -> 'area_alto_cm') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_payload -> 'area_ancho_cm') IS DISTINCT FROM 'number'
    OR (p_payload -> 'whatsapp_enviado' IS NOT NULL AND jsonb_typeof(p_payload -> 'whatsapp_enviado') NOT IN ('boolean', 'null')) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Contacto, referencia, modalidad, caras o medidas inválidos.';
  END IF;

  v_caras := (p_payload ->> 'caras')::numeric::smallint;
  v_alto := (p_payload ->> 'area_alto_cm')::numeric;
  v_ancho := (p_payload ->> 'area_ancho_cm')::numeric;
  v_storefront := (p_payload ->> 'storefront_config_id')::uuid;
  IF NOT (v_alto > 0 AND v_alto <= 100 AND v_ancho > 0 AND v_ancho <= 100)
    OR (p_payload ->> 'cantidad')::numeric NOT BETWEEN 1 AND 10000000
    OR trunc((p_payload ->> 'cantidad')::numeric) <> (p_payload ->> 'cantidad')::numeric
    OR jsonb_array_length(p_archivos) <> v_caras
    OR p_payload ->> 'impresion_sku' <> (CASE
      WHEN p_payload ->> 'modalidad' = 'muestra' THEN '2300100191'
      WHEN v_caras = 1 THEN '2300100105' ELSE '2300100190' END) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Área, cantidad, archivos o SKU del servicio inválidos.';
  END IF;
  v_cantidad := (p_payload ->> 'cantidad')::numeric::integer;

  IF NULLIF(btrim(p_payload ->> 'fecha_requerida'), '') IS NOT NULL THEN
    IF p_payload ->> 'fecha_requerida' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Fecha requerida inválida.';
    END IF;
    v_fecha := (p_payload ->> 'fecha_requerida')::date;
  END IF;

  v_attribution := COALESCE(NULLIF(p_payload -> 'attribution', 'null'::jsonb), '{}'::jsonb);
  IF jsonb_typeof(v_attribution) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Atribución inválida.';
  END IF;
  IF v_attribution - ARRAY['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer', 'landing_url', 'click_at'] <> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Campos de atribución inválidos.';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'referrer', 'landing_url', 'click_at'] LOOP
    IF (v_attribution -> v_key IS NOT NULL AND jsonb_typeof(v_attribution -> v_key) NOT IN ('string', 'null'))
      OR char_length(COALESCE(v_attribution ->> v_key, '')) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Campo de atribución inválido: ' || v_key;
    END IF;
  END LOOP;
  IF NULLIF(btrim(v_attribution ->> 'click_at'), '') IS NOT NULL THEN
    IF v_attribution ->> 'click_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Fecha de atribución inválida.';
    END IF;
    v_click := (v_attribution ->> 'click_at')::timestamptz;
    IF NOT isfinite(v_click) OR v_click > clock_timestamp() + INTERVAL '5 minutes' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Fecha de atribución inválida.';
    END IF;
  END IF;

  FOR v_archivo IN SELECT value FROM jsonb_array_elements(p_archivos) LOOP
    IF jsonb_typeof(v_archivo) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Cada archivo debe ser un objeto con id y token_hash.';
    END IF;
    IF v_archivo - ARRAY['id', 'token_hash'] <> '{}'::jsonb
      OR jsonb_typeof(v_archivo -> 'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_archivo -> 'token_hash') IS DISTINCT FROM 'string'
      OR v_archivo ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR v_archivo ->> 'token_hash' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Identificador o hash de archivo inválido.';
    END IF;
  END LOOP;
  SELECT array_agg((value ->> 'id')::uuid ORDER BY (value ->> 'id')::uuid)
  INTO v_ids FROM jsonb_array_elements(p_archivos);
  IF (SELECT count(DISTINCT id) FROM unnest(v_ids) AS ids(id)) <> v_caras THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'No se puede repetir un archivo.';
  END IF;

  PERFORM pg_advisory_xact_lock(490051, hashtext(p_solicitud_id::text));
  FOR v_carga IN
    SELECT c.* FROM public.empaques_tiff_cargas AS c
    WHERE c.id = ANY(v_ids) ORDER BY c.id FOR UPDATE
  LOOP
    IF v_carga.token_hash IS DISTINCT FROM (
        SELECT value ->> 'token_hash' FROM jsonb_array_elements(p_archivos)
        WHERE (value ->> 'id')::uuid = v_carga.id
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Capacidad de archivo inválida.';
    END IF;
    v_cargas := array_append(v_cargas, v_carga);
  END LOOP;
  IF cardinality(v_cargas) <> v_caras THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Capacidad de archivo inválida.';
  END IF;

  v_now := clock_timestamp();
  FOREACH v_carga IN ARRAY v_cargas LOOP
    IF v_carga.expires_at <= v_now THEN
      RAISE EXCEPTION USING ERRCODE = 'PT410', MESSAGE = 'La carga TIFF ha expirado.';
    END IF;
    IF v_carga.estado NOT IN ('validado', 'usado') THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Todos los archivos deben estar validados.';
    END IF;
    IF v_carga.referencia_sku IS DISTINCT FROM p_payload ->> 'referencia_sku'
      OR v_carga.area_alto_cm IS DISTINCT FROM v_alto OR v_carga.area_ancho_cm IS DISTINCT FROM v_ancho THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'La referencia o área no coincide con el arte validado.';
    END IF;
    IF v_carga.original_path IS DISTINCT FROM 'tiff/' || v_carga.id::text || '/original.tiff'
      OR v_carga.preview_path IS DISTINCT FROM 'tiff/' || v_carga.id::text || '/preview.png'
      OR v_carga.sha256 IS NULL OR v_carga.sha256 !~ '^[0-9a-f]{64}$'
      OR jsonb_typeof(v_carga.validacion) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_carga.validacion -> 'ppp_efectivos') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Faltan la vista previa, el SHA-256 o la validación TIFF.';
    END IF;
    IF (v_carga.validacion ->> 'ppp_efectivos')::numeric < 150 THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'El arte no alcanza 150 ppp efectivos.';
    END IF;
    IF v_carga.cara = 'frente' THEN v_frentes := v_frentes + 1;
    ELSIF v_carga.cara = 'reverso' THEN v_reversos := v_reversos + 1;
    END IF;
    IF v_carga.estado = 'usado' THEN
      v_usados := v_usados + 1;
      IF v_carga.lead_id IS NULL OR (v_lead_usado IS NOT NULL AND v_lead_usado <> v_carga.lead_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Los archivos pertenecen a otra solicitud.';
      END IF;
      v_lead_usado := v_carga.lead_id;
    ELSIF v_carga.lead_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'El archivo ya está asociado a un lead.';
    END IF;
    v_archivos := v_archivos || jsonb_build_array(jsonb_build_object(
      'path', v_carga.original_path, 'nombre', v_carga.nombre, 'tipo', 'image/tiff',
      'tamano', v_carga.tamano_declarado, 'cara', v_carga.cara,
      'preview_path', v_carga.preview_path, 'sha256', v_carga.sha256, 'validacion', v_carga.validacion
    ));
  END LOOP;
  IF v_frentes <> 1 OR v_reversos <> v_caras - 1 OR v_usados NOT IN (0, v_caras) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Se requiere frente y, solo para dos caras, reverso; sin mezclar archivos usados y nuevos.';
  END IF;
  SELECT jsonb_agg(value ORDER BY value ->> 'cara') INTO v_archivos FROM jsonb_array_elements(v_archivos);

  SELECT * INTO v_existente FROM public.lead_empaques_personalizados
  WHERE solicitud_id = p_solicitud_id FOR UPDATE;
  IF FOUND THEN
    IF v_usados <> v_caras OR v_existente.lead_id IS DISTINCT FROM v_lead_usado
      OR v_existente.storefront_config_id IS DISTINCT FROM v_storefront
      OR v_existente.referencia_sku IS DISTINCT FROM p_payload ->> 'referencia_sku'
      OR v_existente.impresion_sku IS DISTINCT FROM p_payload ->> 'impresion_sku'
      OR v_existente.modalidad IS DISTINCT FROM p_payload ->> 'modalidad'
      OR v_existente.caras IS DISTINCT FROM v_caras
      OR v_existente.cantidad IS DISTINCT FROM v_cantidad
      OR v_existente.uso_producto IS DISTINCT FROM btrim(p_payload ->> 'uso_producto')
      OR v_existente.ciudad_entrega IS DISTINCT FROM NULLIF(btrim(p_payload ->> 'ciudad_entrega'), '')
      OR v_existente.fecha_requerida IS DISTINCT FROM v_fecha
      OR v_existente.comentarios IS DISTINCT FROM NULLIF(btrim(p_payload ->> 'comentarios'), '')
      OR NOT EXISTS (
        SELECT 1 FROM public.leads AS l WHERE l.id = v_existente.lead_id
          AND l.nombre = btrim(p_payload ->> 'nombre')
          AND l.empresa IS NOT DISTINCT FROM NULLIF(btrim(p_payload ->> 'empresa'), '')
          AND l.email IS NOT DISTINCT FROM NULLIF(btrim(p_payload ->> 'email'), '')
          AND l.telefono IS NOT DISTINCT FROM NULLIF(btrim(p_payload ->> 'telefono'), '')
      )
      OR v_existente.area_alto_cm IS DISTINCT FROM v_alto OR v_existente.area_ancho_cm IS DISTINCT FROM v_ancho
      OR v_ids IS DISTINCT FROM (
        SELECT array_agg(id ORDER BY id) FROM public.empaques_tiff_cargas WHERE lead_id = v_existente.lead_id
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'La solicitud ya existe con otros archivos o especificaciones.';
    END IF;
    RETURN v_existente.lead_id;
  END IF;
  IF v_usados > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'No se pueden reutilizar archivos de otra solicitud.';
  END IF;

  PERFORM 1 FROM public.storefront_configs AS sc
  WHERE sc.id = v_storefront AND sc.slug = 'empaques' AND sc.activo
    AND (sc.configuracion_extra #> '{landing,personalizados,activo}') IS DISTINCT FROM 'false'::jsonb
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(sc.configuracion_extra #> '{landing,personalizados,referencias}') = 'array'
          THEN sc.configuracion_extra #> '{landing,personalizados,referencias}' ELSE '[]'::jsonb END
      ) AS referencias(ref)
      WHERE ref @> jsonb_build_object('sku', p_payload ->> 'referencia_sku', 'activo', true, 'alto_cm', v_alto, 'ancho_cm', v_ancho)
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Storefront de Empaques no disponible.';
  END IF;
  IF v_fecha < (v_now AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'La fecha requerida no puede estar en el pasado.';
  END IF;

  INSERT INTO public.leads (
    nombre, empresa, email, telefono, mensaje, fuente, estado, whatsapp_enviado,
    gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_url, click_at
  ) VALUES (
    btrim(p_payload ->> 'nombre'), NULLIF(btrim(p_payload ->> 'empresa'), ''),
    NULLIF(btrim(p_payload ->> 'email'), ''), NULLIF(btrim(p_payload ->> 'telefono'), ''),
    NULLIF(btrim(p_payload ->> 'mensaje'), ''), 'empaques_personalizados', 'nuevo',
    COALESCE((p_payload ->> 'whatsapp_enviado')::boolean, false),
    NULLIF(btrim(v_attribution ->> 'gclid'), ''), NULLIF(btrim(v_attribution ->> 'utm_source'), ''),
    NULLIF(btrim(v_attribution ->> 'utm_medium'), ''), NULLIF(btrim(v_attribution ->> 'utm_campaign'), ''),
    NULLIF(btrim(v_attribution ->> 'utm_term'), ''), NULLIF(btrim(v_attribution ->> 'utm_content'), ''),
    NULLIF(btrim(v_attribution ->> 'referrer'), ''), NULLIF(btrim(v_attribution ->> 'landing_url'), ''), v_click
  ) RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_empaques_personalizados (
    lead_id, solicitud_id, storefront_config_id, tipo_empaque, uso_producto,
    medida_largo, medida_ancho, medida_alto, unidad_medida, material, impresion,
    cantidad, ciudad_entrega, fecha_requerida, comentarios, request_hash, archivos,
    referencia_sku, impresion_sku, modalidad, caras, area_alto_cm, area_ancho_cm
  ) VALUES (
    v_lead_id, p_solicitud_id, v_storefront, btrim(p_payload ->> 'tipo_empaque'), btrim(p_payload ->> 'uso_producto'),
    NULL, NULL, NULL, 'cm', NULLIF(btrim(p_payload ->> 'material'), ''), NULLIF(btrim(p_payload ->> 'impresion'), ''),
    v_cantidad, NULLIF(btrim(p_payload ->> 'ciudad_entrega'), ''), v_fecha,
    NULLIF(btrim(p_payload ->> 'comentarios'), ''), p_payload ->> 'request_hash', v_archivos,
    p_payload ->> 'referencia_sku', p_payload ->> 'impresion_sku', p_payload ->> 'modalidad', v_caras, v_alto, v_ancho
  );
  UPDATE public.empaques_tiff_cargas SET estado = 'usado', lead_id = v_lead_id WHERE id = ANY(v_ids);
  RETURN v_lead_id;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'UUID, número o fecha inválidos.';
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'La solicitud o sus archivos ya fueron registrados.';
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_empaques_tiff(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.registrar_empaques_tiff(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reservar_empaques_tiff(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_empaques_tiff(UUID, JSONB, JSONB) TO service_role;

COMMIT;
