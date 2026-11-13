-- Migración 057: tablero comercial (metas, gestión de alertas de clientes y ajustes de umbral).
-- Ejecutar manualmente en Supabase. Solo crea tablas nuevas; no modifica datos existentes.
-- Las tablas se leen y escriben únicamente desde las APIs del portal (service role); sin acceso directo de usuarios.

BEGIN;

-- Meta mensual de ventas (sin IVA) por asesora; la carga Dirección.
CREATE TABLE IF NOT EXISTS public.metas_comerciales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asesor_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  mes DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
  valor NUMERIC(16, 2) NOT NULL CHECK (valor > 0),
  actualizado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asesor_id, mes)
);

-- Gestión de alertas de clientes (cliente Odoo = commercial_partner_id).
CREATE TABLE IF NOT EXISTS public.alertas_clientes_gestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_partner_id BIGINT NOT NULL CHECK (odoo_partner_id > 0),
  asesor_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL CHECK (estado IN ('contactado', 'hizo_pedido', 'pendiente', 'no_requiere', 'oportunidad', 'otro')),
  nota TEXT CHECK (nota IS NULL OR char_length(nota) <= 2000),
  valor_oportunidad NUMERIC(16, 2) CHECK (valor_oportunidad IS NULL OR valor_oportunidad > 0),
  nivel_alerta TEXT CHECK (nivel_alerta IN ('seguimiento', 'prioritaria')),
  ultima_compra DATE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_clientes_gestion_partner ON public.alertas_clientes_gestion(odoo_partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_clientes_gestion_asesor ON public.alertas_clientes_gestion(asesor_id, created_at DESC);

-- Umbrales ajustados por cliente (reemplazan el ritmo aprendido o la regla general de 30/60 días).
CREATE TABLE IF NOT EXISTS public.alertas_clientes_umbral (
  odoo_partner_id BIGINT PRIMARY KEY CHECK (odoo_partner_id > 0),
  dias_seguimiento SMALLINT NOT NULL CHECK (dias_seguimiento BETWEEN 1 AND 730),
  dias_prioritaria SMALLINT NOT NULL CHECK (dias_prioritaria BETWEEN 2 AND 1095),
  actualizado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (dias_prioritaria > dias_seguimiento)
);

ALTER TABLE public.metas_comerciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_clientes_gestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_clientes_umbral ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metas_comerciales, public.alertas_clientes_gestion, public.alertas_clientes_umbral FROM anon, authenticated;

COMMIT;
