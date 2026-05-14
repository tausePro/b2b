/**
 * Utilidades compartidas para detectar costos potencialmente desactualizados
 * y calcular el % de margen (markup sobre costo).
 *
 * Diseñado para usarse en el panel admin (super_admin y dirección) en las
 * pantallas de catálogo de productos. NO debe consumirse en superficies
 * accesibles a roles no autorizados (asesor, comprador, aprobador,
 * editor_contenido), porque expone el costo de compra de Odoo.
 */

/**
 * Días tras los cuales consideramos el costo "desactualizado" y mostramos
 * la alerta roja. < 30 días = fresco (verde), >= 30 días = stale (rojo).
 */
export const COST_STALE_THRESHOLD_DAYS = 30;

/**
 * Parsea una fecha ISO de Odoo (formato "YYYY-MM-DD HH:MM:SS" o
 * "YYYY-MM-DDTHH:MM:SS") y la convierte a Date.
 * Devuelve null si la fecha es inválida.
 */
export function parseOdooDate(input: string | false | null | undefined): Date | null {
  if (!input || typeof input !== 'string') return null;
  // Odoo a veces devuelve "2024-05-12 14:33:21" sin la T separadora.
  const normalized = input.includes('T') ? input : input.replace(' ', 'T');
  const withZone = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Calcula los días enteros transcurridos desde una fecha ISO hasta ahora.
 * Devuelve null si la fecha es inválida o futura.
 */
export function daysSinceOdooDate(input: string | false | null | undefined): number | null {
  const date = parseOdooDate(input);
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export interface CostStaleness {
  /** Días desde la última escritura del registro en Odoo. null si no hay fecha válida. */
  dias: number | null;
  /** true si dias >= threshold. false si es fresco. null si no se puede determinar. */
  desactualizado: boolean | null;
  /** Etiqueta human-readable: "hoy", "hace 5 días", "hace 2 meses", "sin fecha". */
  label: string;
}

/**
 * Resuelve el estado de antigüedad de un producto en base a su write_date
 * de Odoo. Útil para renderizar UI consistente en ambas pantallas.
 */
export function getCostStaleness(
  writeDate: string | false | null | undefined,
  thresholdDays: number = COST_STALE_THRESHOLD_DAYS
): CostStaleness {
  const dias = daysSinceOdooDate(writeDate);
  if (dias === null) {
    return { dias: null, desactualizado: null, label: 'sin fecha' };
  }

  let label: string;
  if (dias === 0) label = 'hoy';
  else if (dias === 1) label = 'hace 1 día';
  else if (dias < 30) label = `hace ${dias} días`;
  else if (dias < 60) label = 'hace 1 mes';
  else if (dias < 365) label = `hace ${Math.floor(dias / 30)} meses`;
  else if (dias < 730) label = 'hace 1 año';
  else label = `hace ${Math.floor(dias / 365)} años`;

  return {
    dias,
    desactualizado: dias >= thresholdDays,
    label,
  };
}

/**
 * Calcula el markup (margen sobre costo) como porcentaje:
 *   markup% = (precio_venta − costo) / costo × 100
 *
 * Devuelve null si el costo no es válido (<= 0) para evitar divisiones
 * problemáticas. Un valor negativo indica que se vende a pérdida.
 */
export function markupOnCost(
  salePrice: number | null | undefined,
  cost: number | null | undefined
): number | null {
  if (
    typeof salePrice !== 'number' ||
    !Number.isFinite(salePrice) ||
    typeof cost !== 'number' ||
    !Number.isFinite(cost) ||
    cost <= 0
  ) {
    return null;
  }
  return ((salePrice - cost) / cost) * 100;
}

/**
 * Formatea un porcentaje de markup con signo y un decimal.
 * Ej: 23.5 -> "+23.5%",   -12 -> "-12.0%",   null -> "—"
 */
export function formatMarkupPercent(markup: number | null): string {
  if (markup === null || !Number.isFinite(markup)) return '—';
  const rounded = Math.round(markup * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
}
