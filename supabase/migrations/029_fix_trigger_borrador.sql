-- ============================================
-- 029: Fix trigger set_estado_pedido_inicial para respetar estado 'borrador'
-- Reemplaza la función existente sin eliminar el trigger
-- ============================================

CREATE OR REPLACE FUNCTION public.set_estado_pedido_inicial()
RETURNS TRIGGER AS $$
DECLARE
  v_requiere_aprobacion BOOLEAN;
BEGIN
  -- Si el pedido se crea explícitamente como borrador, respetar ese estado
  IF NEW.estado = 'borrador' THEN
    RETURN NEW;
  END IF;

  SELECT e.requiere_aprobacion
  INTO v_requiere_aprobacion
  FROM public.empresas e
  WHERE e.id = NEW.empresa_id;

  IF COALESCE(v_requiere_aprobacion, true) THEN
    IF NEW.estado IS NULL OR NEW.estado = '' THEN
      NEW.estado := 'en_aprobacion';
    END IF;
  ELSE
    NEW.estado := 'aprobado';
    NEW.fecha_aprobacion := COALESCE(NEW.fecha_aprobacion, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
