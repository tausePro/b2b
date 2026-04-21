-- ============================================================
-- Migración 036: Atribución de leads (Google Ads + UTM)
--
-- Objetivo: capturar gclid, parámetros utm_*, referrer y landing_url
-- para cada lead. Esto permite:
--   a) medir qué campañas de Google Ads generan leads reales
--   b) en una fase posterior, subir la conversión al Google Ads
--      Conversion API (upload click conversions) server-side usando
--      el gclid almacenado.
--
-- SEGURA: solo ADD COLUMN IF NOT EXISTS, sin tocar filas existentes.
-- Leads previos a esta migración quedan con campos NULL; no afecta
-- ningún reporte existente porque la UI trata estos campos como
-- opcionales.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS landing_url TEXT,
  -- Timestamp del click originario (cuando el visitante llegó al
  -- sitio por primera vez con gclid/utm). Lo capturamos en cliente
  -- al escribir la cookie de atribución y lo reenviamos en el POST
  -- del lead. Es necesario para el payload de Google Ads Conversion
  -- API (conversion_date_time debe ser >= click_date_time).
  ADD COLUMN IF NOT EXISTS click_at TIMESTAMPTZ;

-- Índices para los reportes más frecuentes (últimos leads por campaña,
-- filtrar por gclid, etc.).
CREATE INDEX IF NOT EXISTS idx_leads_gclid ON public.leads(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads(utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON public.leads(utm_campaign);
