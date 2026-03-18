CREATE TABLE public.notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  actor_usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'pedido_creado_en_aprobacion',
    'pedido_creado_autoaprobado',
    'pedido_aprobado',
    'pedido_rechazado',
    'pedido_validado',
    'pedido_procesado_odoo'
  )),
  nivel TEXT NOT NULL DEFAULT 'info' CHECK (nivel IN ('info', 'success', 'warning', 'danger')),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  ruta TEXT,
  entidad_tipo TEXT,
  entidad_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  leida BOOLEAN NOT NULL DEFAULT false,
  leida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_usuario_leida_created_at
  ON public.notificaciones(usuario_id, leida, created_at DESC);

CREATE INDEX idx_notificaciones_entidad
  ON public.notificaciones(entidad_tipo, entidad_id);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificaciones_select" ON public.notificaciones
  FOR SELECT TO authenticated
  USING (usuario_id = public.get_mi_usuario_id());

CREATE POLICY "notificaciones_update" ON public.notificaciones
  FOR UPDATE TO authenticated
  USING (usuario_id = public.get_mi_usuario_id())
  WITH CHECK (usuario_id = public.get_mi_usuario_id());

CREATE TABLE public.notificaciones_email (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  actor_usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'pedido_creado_en_aprobacion',
    'pedido_creado_autoaprobado',
    'pedido_aprobado',
    'pedido_rechazado',
    'pedido_validado',
    'pedido_procesado_odoo'
  )),
  email_destino TEXT NOT NULL,
  nombre_destino TEXT,
  asunto TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  entidad_tipo TEXT,
  entidad_id UUID,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'enviado', 'error')),
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  provider TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_email_estado_scheduled_at
  ON public.notificaciones_email(estado, scheduled_at ASC);

CREATE INDEX idx_notificaciones_email_usuario_created_at
  ON public.notificaciones_email(usuario_id, created_at DESC);

ALTER TABLE public.notificaciones_email ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trigger_updated_at_notificaciones_email
  BEFORE UPDATE ON public.notificaciones_email
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
