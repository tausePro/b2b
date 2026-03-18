CREATE TABLE IF NOT EXISTS public.notificaciones_email_templates (
  tipo TEXT PRIMARY KEY CHECK (tipo IN (
    'pedido_creado_en_aprobacion',
    'pedido_creado_autoaprobado',
    'pedido_aprobado',
    'pedido_rechazado',
    'pedido_validado',
    'pedido_procesado_odoo'
  )),
  nombre TEXT NOT NULL,
  descripcion_operativa TEXT NOT NULL,
  asunto_template TEXT NOT NULL,
  titulo_template TEXT NOT NULL,
  intro_template TEXT NOT NULL,
  descripcion_template TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Ver detalle en la plataforma',
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notificaciones_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificaciones_email_templates_select_super_admin" ON public.notificaciones_email_templates;
CREATE POLICY "notificaciones_email_templates_select_super_admin" ON public.notificaciones_email_templates
  FOR SELECT TO authenticated
  USING (public.get_mi_rol() = 'super_admin');

DROP POLICY IF EXISTS "notificaciones_email_templates_insert_super_admin" ON public.notificaciones_email_templates;
CREATE POLICY "notificaciones_email_templates_insert_super_admin" ON public.notificaciones_email_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.get_mi_rol() = 'super_admin');

DROP POLICY IF EXISTS "notificaciones_email_templates_update_super_admin" ON public.notificaciones_email_templates;
CREATE POLICY "notificaciones_email_templates_update_super_admin" ON public.notificaciones_email_templates
  FOR UPDATE TO authenticated
  USING (public.get_mi_rol() = 'super_admin')
  WITH CHECK (public.get_mi_rol() = 'super_admin');

DROP POLICY IF EXISTS "notificaciones_email_templates_delete_super_admin" ON public.notificaciones_email_templates;
DROP TRIGGER IF EXISTS trigger_updated_at_notificaciones_email_templates ON public.notificaciones_email_templates;
CREATE TRIGGER trigger_updated_at_notificaciones_email_templates
  BEFORE UPDATE ON public.notificaciones_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

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
)
VALUES
  (
    'pedido_creado_en_aprobacion',
    'Pedido creado pendiente de aprobación',
    'Se envía a los aprobadores cuando un pedido entra al flujo de aprobación.',
    'Nuevo pedido {{pedido_numero}} pendiente de aprobación',
    'Pedido {{pedido_numero}} pendiente de aprobación',
    'Se registró un pedido {{pedido_numero}} que requiere aprobación.',
    'Se creó un nuevo pedido para {{sede}} y requiere aprobación dentro de {{empresa}}.',
    'Revisar pedido en la plataforma',
    true
  ),
  (
    'pedido_creado_autoaprobado',
    'Pedido creado con aprobación automática',
    'Se envía al creador y a los asesores cuando un pedido no requiere aprobación.',
    'Pedido {{pedido_numero}} creado con aprobación automática',
    'Pedido {{pedido_numero}} creado con aprobación automática',
    'Se registró un pedido {{pedido_numero}} con aprobación automática.',
    'El pedido quedó creado sin requerir aprobación para {{empresa}}.',
    'Ver detalle del pedido',
    true
  ),
  (
    'pedido_aprobado',
    'Pedido aprobado',
    'Se envía al creador y a los asesores cuando un aprobador aprueba el pedido.',
    'Pedido {{pedido_numero}} aprobado',
    'Pedido {{pedido_numero}} aprobado',
    'El pedido {{pedido_numero}} fue aprobado por {{actor_nombre}}.',
    '{{actor_nombre}} aprobó el pedido. {{detalle_odoo_aprobacion}}',
    'Ver pedido aprobado',
    true
  ),
  (
    'pedido_rechazado',
    'Pedido rechazado',
    'Se envía al creador cuando un aprobador rechaza el pedido.',
    'Pedido {{pedido_numero}} rechazado',
    'Pedido {{pedido_numero}} rechazado',
    'El pedido {{pedido_numero}} fue rechazado por {{actor_nombre}}.',
    '{{actor_nombre}} rechazó el pedido asociado a la sede {{sede}}.',
    'Revisar pedido rechazado',
    true
  ),
  (
    'pedido_validado',
    'Pedido en validación Imprima',
    'Se envía al creador cuando un asesor toma el pedido para validación comercial.',
    'Pedido {{pedido_numero}} en validación Imprima',
    'Pedido {{pedido_numero}} en validación Imprima',
    'El pedido {{pedido_numero}} pasó a validación Imprima por {{actor_nombre}}.',
    '{{actor_nombre}} tomó el pedido para validación comercial dentro de Imprima.',
    'Ver estado de validación',
    true
  ),
  (
    'pedido_procesado_odoo',
    'Pedido procesado en Odoo',
    'Se envía al creador y a los asesores cuando el pedido ya quedó sincronizado con Odoo.',
    'Pedido {{pedido_numero}} procesado en Odoo',
    'Pedido {{pedido_numero}} procesado en Odoo',
    'El pedido {{pedido_numero}} fue procesado en Odoo.',
    'El pedido ya quedó sincronizado con Odoo para {{empresa}}.',
    'Ver pedido procesado',
    true
  )
ON CONFLICT (tipo) DO NOTHING;
