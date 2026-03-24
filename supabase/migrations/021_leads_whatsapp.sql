-- ============================================================
-- Migración 021: Sistema de leads + WhatsApp configurable
-- SEGURA: solo CREATE e INSERT, sin cambios destructivos
-- ============================================================

-- 1. Tabla de leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  empresa TEXT,
  email TEXT,
  telefono TEXT,
  mensaje TEXT,
  fuente TEXT NOT NULL DEFAULT 'landing',
  estado TEXT NOT NULL DEFAULT 'nuevo',
  whatsapp_enviado BOOLEAN NOT NULL DEFAULT false,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_leads_estado ON public.leads(estado);
CREATE INDEX IF NOT EXISTS idx_leads_fuente ON public.leads(fuente);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

-- 3. Trigger updated_at
CREATE OR REPLACE FUNCTION public.leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leads_updated_at ON public.leads;
CREATE TRIGGER trigger_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_updated_at();

-- 4. RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_insert_publico"
  ON public.leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "leads_select_admin"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

CREATE POLICY "leads_update_admin"
  ON public.leads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

CREATE POLICY "leads_delete_admin"
  ON public.leads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_id = auth.uid()
        AND usuarios.rol IN ('super_admin', 'direccion')
    )
  );

-- 5. Configuración WhatsApp en landing_contenido
INSERT INTO public.landing_contenido (id, titulo, subtitulo, contenido, imagen_url, orden, activo) VALUES
(
  'config_whatsapp',
  'Configuración WhatsApp',
  NULL,
  '{
    "numero": "",
    "mensaje_default": "Hola, me interesa conocer más sobre los suministros corporativos de Imprima.",
    "cta_texto": "Hablar con un asesor",
    "activo": true
  }'::jsonb,
  NULL,
  20,
  true
)
ON CONFLICT (id) DO NOTHING;
