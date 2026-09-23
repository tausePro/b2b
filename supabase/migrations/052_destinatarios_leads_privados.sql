BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  v_destinatarios JSONB;
BEGIN
  IF to_regclass('public.landing_contenido') IS NULL
    OR to_regclass('public.landing_contenido_versiones') IS NULL THEN
    RAISE EXCEPTION 'Faltan las tablas del CMS y su historial. No se aplicó 052.';
  END IF;
  SELECT contenido -> 'destinatarios' INTO v_destinatarios
  FROM public.landing_contenido WHERE id = 'config_leads_notificaciones';
  IF v_destinatarios IS NULL OR jsonb_typeof(v_destinatarios) <> 'array' THEN
    RAISE EXCEPTION 'Falta la lista configurada por 051. No se reemplazaron destinatarios.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_destinatarios) AS entry(value)
    WHERE COALESCE(CASE WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}' ELSE value ->> 'email' END, '')
      !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ) THEN
    RAISE EXCEPTION 'Hay destinatarios anteriores inválidos. Revísalos antes de aplicar 052.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lead_notification_settings (
  id TEXT PRIMARY KEY CHECK (id = 'leads'),
  activo BOOLEAN NOT NULL DEFAULT true,
  destinatarios JSONB NOT NULL CHECK (jsonb_typeof(destinatarios) = 'array' AND jsonb_array_length(destinatarios) <= 10),
  actualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lead_notification_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_notification_settings TO service_role;

CREATE OR REPLACE FUNCTION public.touch_lead_notification_settings()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER lead_notification_settings_updated_at
BEFORE UPDATE ON public.lead_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_notification_settings();

WITH previous AS (
  SELECT activo, contenido -> 'destinatarios' AS recipients
  FROM public.landing_contenido WHERE id = 'config_leads_notificaciones'
), entries AS (
  SELECT value, ordinality,
    lower(btrim(CASE WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}' ELSE value ->> 'email' END)) AS email
  FROM previous,
    jsonb_array_elements(recipients || '[{"email":"vanesapgalvis3@gmail.com","nombre":null},{"email":"vanesa.patino@imprima.com.co","nombre":null}]'::jsonb)
    WITH ORDINALITY AS entry(value, ordinality)
), deduplicated AS (
  SELECT DISTINCT ON (email) email, value, ordinality
  FROM entries ORDER BY email, ordinality
)
INSERT INTO public.lead_notification_settings (id, activo, destinatarios)
SELECT 'leads', (SELECT activo FROM previous), jsonb_agg(
  CASE WHEN jsonb_typeof(value) = 'string' THEN jsonb_build_object('email', email, 'nombre', NULL)
    ELSE value || jsonb_build_object('email', email) END ORDER BY ordinality
)
FROM deduplicated
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'landing_contenido' AND policyname = 'landing_internal_lead_settings_private') THEN
    CREATE POLICY landing_internal_lead_settings_private ON public.landing_contenido
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (id <> 'config_leads_notificaciones')
      WITH CHECK (id <> 'config_leads_notificaciones');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'landing_contenido_versiones' AND policyname = 'landing_internal_lead_history_private') THEN
    CREATE POLICY landing_internal_lead_history_private ON public.landing_contenido_versiones
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (seccion_id <> 'config_leads_notificaciones')
      WITH CHECK (seccion_id <> 'config_leads_notificaciones');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
