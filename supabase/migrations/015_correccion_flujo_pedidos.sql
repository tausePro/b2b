-- ============================================
-- Migración 015: Corrección del flujo de pedidos
-- ============================================
-- Problemas que corrige:
-- 1. El trigger descontar_presupuesto_al_aprobar() solo corría en UPDATE.
--    Cuando una empresa tiene requiere_aprobacion = false, el pedido nace
--    como 'aprobado' via INSERT y el presupuesto nunca se descontaba.
-- 2. procesado_odoo no se persistía nunca como estado real en la BD.
--    Se infería visualmente desde odoo_sale_order_id en el frontend.
-- ============================================

-- ============================================
-- 1. Reemplazar trigger de presupuesto para que cubra INSERT + UPDATE
-- ============================================

CREATE OR REPLACE FUNCTION public.descontar_presupuesto_al_aprobar()
RETURNS TRIGGER AS $$
DECLARE
  presupuesto_record RECORD;
  mes_actual INTEGER;
  anio_actual INTEGER;
  debe_descontar BOOLEAN := false;
BEGIN
  -- Determinar si debemos descontar
  IF TG_OP = 'INSERT' THEN
    debe_descontar := (NEW.fecha_aprobacion IS NOT NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    debe_descontar := (OLD.fecha_aprobacion IS NULL AND NEW.fecha_aprobacion IS NOT NULL);
  END IF;

  IF NOT debe_descontar THEN
    RETURN NEW;
  END IF;

  -- Si no hay sede, no hay presupuesto que descontar
  IF NEW.sede_id IS NULL THEN
    RETURN NEW;
  END IF;

  mes_actual := EXTRACT(MONTH FROM now());
  anio_actual := EXTRACT(YEAR FROM now());

  -- Buscar presupuesto mensual activo de la sede
  SELECT * INTO presupuesto_record
  FROM public.presupuestos_mensuales
  WHERE sede_id = NEW.sede_id
    AND mes = mes_actual
    AND anio = anio_actual
    AND estado = 'activo'
  FOR UPDATE;

  IF presupuesto_record IS NOT NULL THEN
    -- Verificar si excede presupuesto
    IF NEW.valor_total_cop > presupuesto_record.monto_inicial - presupuesto_record.monto_consumido THEN
      NEW.excede_presupuesto := true;
    END IF;

    -- Descontar del presupuesto
    UPDATE public.presupuestos_mensuales
    SET monto_consumido = monto_consumido + NEW.valor_total_cop
    WHERE id = presupuesto_record.id;

    -- Marcar como excedido si el nuevo consumido supera el inicial
    IF (presupuesto_record.monto_consumido + NEW.valor_total_cop) > presupuesto_record.monto_inicial THEN
      UPDATE public.presupuestos_mensuales
      SET estado = 'excedido'
      WHERE id = presupuesto_record.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar el trigger viejo (solo UPDATE)
DROP TRIGGER IF EXISTS trigger_descontar_presupuesto ON public.pedidos;
DROP TRIGGER IF EXISTS trigger_descontar_presupuesto_insert ON public.pedidos;
DROP TRIGGER IF EXISTS trigger_zz_descontar_presupuesto_insert ON public.pedidos;
DROP TRIGGER IF EXISTS trigger_descontar_presupuesto_update ON public.pedidos;

-- Crear trigger para INSERT
CREATE TRIGGER trigger_zz_descontar_presupuesto_insert
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.descontar_presupuesto_al_aprobar();

-- Crear trigger para UPDATE
CREATE TRIGGER trigger_descontar_presupuesto_update
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.descontar_presupuesto_al_aprobar();
