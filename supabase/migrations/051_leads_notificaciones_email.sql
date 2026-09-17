-- ============================================================
-- Migración 051: avisos por correo de leads del sitio público
--
-- 1. Amplía el CHECK de `tipo` en notificaciones_email y
--    notificaciones_email_templates para aceptar 'lead_creado'.
-- 2. Registra la plantilla editable del aviso (editable en /admin/configuracion).
-- 3. Crea la configuración de destinatarios en landing_contenido
--    (id 'config_leads_notificaciones'), editable sin nueva migración.
--
-- No modifica pedidos, leads existentes ni correos ya encolados.
-- Idempotente: los INSERT usan ON CONFLICT DO NOTHING y los CHECK se
-- recrean con la lista completa de tipos.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_tabla TEXT;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'public.notificaciones_email',
    'public.notificaciones_email_templates',
    'public.landing_contenido',
    'public.leads'
  ] LOOP
    IF to_regclass(v_tabla) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla requerida %. No se aplicó la migración 051.', v_tabla;
    END IF;
  END LOOP;
END $$;

-- 1. CHECK de tipos: outbox de correos
ALTER TABLE public.notificaciones_email
  DROP CONSTRAINT IF EXISTS notificaciones_email_tipo_check;
ALTER TABLE public.notificaciones_email
  ADD CONSTRAINT notificaciones_email_tipo_check CHECK (tipo IN (
    'pedido_creado_en_aprobacion',
    'pedido_creado_autoaprobado',
    'pedido_aprobado',
    'pedido_rechazado',
    'pedido_validado',
    'pedido_procesado_odoo',
    'lead_creado'
  ));

-- CHECK de tipos: plantillas editables
ALTER TABLE public.notificaciones_email_templates
  DROP CONSTRAINT IF EXISTS notificaciones_email_templates_tipo_check;
ALTER TABLE public.notificaciones_email_templates
  ADD CONSTRAINT notificaciones_email_templates_tipo_check CHECK (tipo IN (
    'pedido_creado_en_aprobacion',
    'pedido_creado_autoaprobado',
    'pedido_aprobado',
    'pedido_rechazado',
    'pedido_validado',
    'pedido_procesado_odoo',
    'lead_creado'
  ));

-- 2. Plantilla editable del aviso de lead
INSERT INTO public.notificaciones_email_templates (
  tipo,
  nombre,
  descripcion_operativa,
  asunto_template,
  titulo_template,
  intro_template,
  descripcion_template,
  cta_label,
  activa
) VALUES (
  'lead_creado',
  'Nuevo lead recibido',
  'Se envía al equipo comercial configurado cuando llega una solicitud desde el sitio público, incluidos los empaques personalizados.',
  'Nuevo lead: {{lead_nombre}} — {{lead_fuente}}',
  'Nueva solicitud de {{lead_nombre}}',
  'Llegó una nueva solicitud desde el sitio público ({{lead_fuente}}).',
  '{{lead_resumen}}',
  'Abrir la solicitud en el panel',
  true
)
ON CONFLICT (tipo) DO NOTHING;

-- 3. Destinatarios de los avisos (editable en landing_contenido sin migrar)
INSERT INTO public.landing_contenido (id, titulo, subtitulo, contenido, imagen_url, orden, activo)
VALUES (
  'config_leads_notificaciones',
  'Notificaciones de leads',
  'Correos que reciben el aviso de cada solicitud del sitio público.',
  jsonb_build_object(
    'destinatarios', jsonb_build_array(
      jsonb_build_object('email', 'jufecama@gmail.com', 'nombre', 'Juan Felipe'),
      jsonb_build_object('email', 'nicolas.imprima@gmail.com', 'nombre', 'Nicolás')
    )
  ),
  NULL,
  21,
  true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
