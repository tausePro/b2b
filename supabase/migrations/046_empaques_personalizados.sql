CREATE TABLE IF NOT EXISTS public.lead_empaques_personalizados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  storefront_config_id UUID NOT NULL REFERENCES public.storefront_configs(id) ON DELETE RESTRICT,
  tipo_empaque TEXT NOT NULL CHECK (char_length(tipo_empaque) BETWEEN 2 AND 120),
  uso_producto TEXT NOT NULL CHECK (char_length(uso_producto) BETWEEN 2 AND 500),
  medida_largo NUMERIC(10,2) CHECK (medida_largo IS NULL OR medida_largo > 0),
  medida_ancho NUMERIC(10,2) CHECK (medida_ancho IS NULL OR medida_ancho > 0),
  medida_alto NUMERIC(10,2) CHECK (medida_alto IS NULL OR medida_alto > 0),
  unidad_medida TEXT NOT NULL DEFAULT 'cm' CHECK (unidad_medida IN ('mm', 'cm')),
  material TEXT,
  impresion TEXT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  ciudad_entrega TEXT,
  fecha_requerida DATE,
  comentarios TEXT,
  request_hash TEXT,
  archivos JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(archivos) = 'array'
    AND jsonb_array_length(archivos) <= 3
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_empaques_personalizados_lead
  ON public.lead_empaques_personalizados(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_empaques_personalizados_storefront
  ON public.lead_empaques_personalizados(storefront_config_id);
CREATE INDEX IF NOT EXISTS idx_lead_empaques_personalizados_created_at
  ON public.lead_empaques_personalizados(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_empaques_personalizados_request_hash
  ON public.lead_empaques_personalizados(request_hash, created_at DESC)
  WHERE request_hash IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_lead_empaques_personalizados_updated_at
  ON public.lead_empaques_personalizados;
CREATE TRIGGER trigger_lead_empaques_personalizados_updated_at
  BEFORE UPDATE ON public.lead_empaques_personalizados
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.lead_empaques_personalizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_empaques_personalizados_select_internal"
  ON public.lead_empaques_personalizados;
CREATE POLICY "lead_empaques_personalizados_select_internal"
  ON public.lead_empaques_personalizados
  FOR SELECT TO authenticated
  USING (
    public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'super_admin')
    OR public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'direccion')
    OR public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'editor_contenido')
  );

REVOKE ALL ON public.lead_empaques_personalizados FROM anon;
GRANT SELECT ON public.lead_empaques_personalizados TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'empaques-solicitudes',
  'empaques-solicitudes',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "empaques_solicitudes_select_internal" ON storage.objects;
CREATE POLICY "empaques_solicitudes_select_internal"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'empaques-solicitudes'
    AND (
      public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'super_admin')
      OR public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'direccion')
      OR public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'editor_contenido')
    )
  );

DROP POLICY IF EXISTS "empaques_solicitudes_delete_internal" ON storage.objects;
CREATE POLICY "empaques_solicitudes_delete_internal"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'empaques-solicitudes'
    AND (
      public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'super_admin')
      OR public.usuario_tiene_rol_o_extra(public.get_mi_usuario_id(), 'direccion')
    )
  );
