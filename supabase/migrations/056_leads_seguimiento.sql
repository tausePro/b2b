-- Migración 056: seguimiento comercial de leads.
-- Ejecutar manualmente en Supabase. Solo agrega columnas y una tabla nueva; no modifica filas existentes.
-- asignado_a: asesora responsable. contactado_at: primer cambio de "nuevo" a otro estado (tiempo de respuesta).
-- lead_eventos: historial de gestión (notas, cambios de estado y asignaciones). Solo el service role (API) lee y escribe.

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS asignado_a UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contactado_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_asignado_a ON public.leads(asignado_a);

CREATE TABLE IF NOT EXISTS public.lead_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('nota', 'estado', 'asignacion')),
  detalle TEXT NOT NULL CHECK (char_length(detalle) BETWEEN 1 AND 2000),
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_eventos_lead ON public.lead_eventos(lead_id, created_at DESC);

ALTER TABLE public.lead_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_eventos FROM anon, authenticated;

COMMIT;
