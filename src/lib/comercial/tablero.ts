/**
 * Tablero comercial (pedido de Gerencia): ritmo de compra por cliente, alertas y tendencia de ventas.
 * Lógica pura y explicable; los datos vienen de facturas publicadas en Odoo (solo lectura).
 */

export const DEFAULT_FOLLOW_UP_DAYS = 30;
export const DEFAULT_PRIORITY_DAYS = 60;
export const MIN_PURCHASES_FOR_PATTERN = 3;
export const TREND_STABLE_PERCENT = 5;

export type AlertLevel = 'al_dia' | 'seguimiento' | 'prioritaria';
export type TrendStatus = 'creciendo' | 'estable' | 'bajando';

export interface PurchasePattern { purchases: number; medianDays: number; p25Days: number; p75Days: number }
export interface ClientAlert { level: AlertLevel; daysSince: number; followAfter: number; priorityAfter: number; reason: string; usesPattern: boolean }

const DAY_MS = 86_400_000;
const toUtcDay = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
export const daysBetweenDates = (from: string, to: string) => Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS);

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Ritmo de compra: intervalos entre fechas de compra distintas (mediana y rango normal p25–p75). Requiere 3 compras o más. */
export function purchasePattern(invoiceDates: readonly string[]): PurchasePattern | null {
  const days = [...new Set(invoiceDates.map(date => date.slice(0, 10)))].sort();
  if (days.length < MIN_PURCHASES_FOR_PATTERN) return null;
  const intervals = days.slice(1).map((day, index) => daysBetweenDates(days[index], day)).filter(value => value > 0).sort((a, b) => a - b);
  if (intervals.length < MIN_PURCHASES_FOR_PATTERN - 1) return null;
  return {
    purchases: days.length,
    medianDays: Math.round(percentile(intervals, 0.5)),
    p25Days: Math.round(percentile(intervals, 0.25)),
    p75Days: Math.round(percentile(intervals, 0.75)),
  };
}

/**
 * Alerta del cliente según su ritmo: seguimiento al pasar su rango normal (p75, mínimo la mediana)
 * y prioritaria al doblar su intervalo típico. Sin ritmo: regla general de 30 y 60 días (o el ajuste del cliente).
 */
export function clientAlert(
  lastPurchase: string,
  today: string,
  pattern: PurchasePattern | null,
  override?: { followUpDays: number; priorityDays: number } | null,
): ClientAlert {
  const daysSince = Math.max(0, daysBetweenDates(lastPurchase, today));
  const usesPattern = !override && pattern !== null;
  const followAfter = override?.followUpDays ?? (pattern ? Math.max(pattern.p75Days, pattern.medianDays, 1) : DEFAULT_FOLLOW_UP_DAYS);
  const priorityAfter = override?.priorityDays ?? (pattern ? Math.max(pattern.medianDays * 2, followAfter + 1) : DEFAULT_PRIORITY_DAYS);
  const level: AlertLevel = daysSince > priorityAfter ? 'prioritaria' : daysSince > followAfter ? 'seguimiento' : 'al_dia';
  const reason = override
    ? `Umbral ajustado: seguimiento a ${followAfter} días, prioritaria a ${priorityAfter}; lleva ${daysSince} días sin comprar`
    : pattern
      ? `Compra cada ~${pattern.medianDays} días (normal ${pattern.p25Days}–${pattern.p75Days}); lleva ${daysSince}`
      : `Sin ritmo definido (menos de ${MIN_PURCHASES_FOR_PATTERN} compras); lleva ${daysSince} días sin comprar`;
  return { level, daysSince, followAfter, priorityAfter, reason, usesPattern };
}

export function trendStatus(changePercent: number | null): TrendStatus | null {
  if (changePercent === null) return null;
  if (changePercent > TREND_STABLE_PERCENT) return 'creciendo';
  if (changePercent < -TREND_STABLE_PERCENT) return 'bajando';
  return 'estable';
}

/** Proyección al cierre del mes con el ritmo diario actual (día 1 al día de hoy). */
export function monthProjection(monthToDateSales: number, today: string): number {
  const day = Number(today.slice(8, 10));
  const [year, month] = today.slice(0, 7).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day > 0 ? Math.round(monthToDateSales / day * daysInMonth * 100) / 100 : 0;
}

export function goalProgress(sales: number, goal: number | null): number | null {
  return goal && goal > 0 ? Math.round(sales / goal * 1000) / 10 : null;
}
