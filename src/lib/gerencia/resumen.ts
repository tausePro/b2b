import { roundCurrency } from '@/lib/comisiones/bonoPlataforma';

export const EXECUTIVE_MONTHS = 12;

export interface PeriodRange { from: string; to: string }
export interface MonthTotals { sales: number; cost: number; profit: number; documents: number }
export interface ExecutiveMonth extends MonthTotals {
  month: string;
  partial: boolean;
  marginPercent: number | null;
  previousMonth: MonthTotals;
  previousYear: MonthTotals;
  salesVsPreviousMonth: number | null;
  salesVsPreviousYear: number | null;
  profitVsPreviousMonth: number | null;
  profitVsPreviousYear: number | null;
}
export interface ExecutiveDraft { id: number; name: string; documentType: 'out_invoice' | 'out_refund'; partnerName: string; advisorName: string | null; date: string | null; untaxed: number }
export interface ExecutiveOrderToInvoice { id: number; name: string; partnerName: string; advisorName: string | null; date: string | null; ageDays: number | null; amountToInvoice: number }
export interface ZeroCostGoods { range: PeriodRange; lineCount: number; sales: number }
export const STALE_ORDER_DAYS = 15;
export type KpiPeriod = 'mes' | 'mes_anterior' | 'anio';
export interface PeriodKpi { period: KpiPeriod; label: string; totals: MonthTotals; marginPercent: number | null; comparisons: { label: string; totals: MonthTotals }[] }
export interface ExecutiveAdvisorAmount { advisorId: number | null; advisorName: string; amount: number; lineCount: number }
export interface ExecutiveSummary {
  currency: 'COP';
  scope: 'full' | 'sales';
  company: { id: number; name: string };
  asOfDate: string;
  generatedAt: string;
  months: ExecutiveMonth[];
  currentPeriod: { range: PeriodRange; previousMonthRange: PeriodRange; previousYearRange: PeriodRange };
  drafts: { count: number; untaxed: number; invoices: number; creditNotes: number; items: ExecutiveDraft[] };
  toInvoice: {
    orderCount: number; lineCount: number; untaxed: number; orders: ExecutiveOrderToInvoice[]; byAdvisor: ExecutiveAdvisorAmount[];
    stale: { days: number; count: number; amount: number; orderNames: string[] };
  };
  zeroCostGoods: { current: ZeroCostGoods; previousMonth: ZeroCostGoods };
  warnings: string[];
}

export const EMPTY_TOTALS: MonthTotals = { sales: 0, cost: 0, profit: 0, documents: 0 };

function parseDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [year, month, day] = match ? match.slice(1).map(Number) : [NaN, NaN, NaN];
  if (!match || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value) throw new Error('Fecha no válida.');
  return { year, month, day };
}

const pad = (value: number) => String(value).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function shiftMonth(month: string, delta: number): string {
  const { year, month: value } = parseDate(`${month}-01`);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Mismo período (día 1 al mismo día, ajustado al último día del mes) desplazado `delta` meses. */
export function samePeriod(today: string, delta: number): PeriodRange {
  const { day } = parseDate(today);
  const month = shiftMonth(today.slice(0, 7), delta);
  const { year, month: value } = parseDate(`${month}-01`);
  return { from: `${month}-01`, to: `${month}-${pad(Math.min(day, lastDay(year, value)))}` };
}

export function executiveRange(today: string): PeriodRange {
  return { from: `${shiftMonth(today.slice(0, 7), -(EXECUTIVE_MONTHS * 2 - 1))}-01`, to: today };
}

export function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : roundCurrency((current - previous) / Math.abs(previous) * 100);
}

export function marginPercent(totals: MonthTotals): number | null {
  return totals.sales > 0 ? roundCurrency(totals.profit / totals.sales * 100) : null;
}

export function buildExecutiveMonths(
  buckets: ReadonlyMap<string, MonthTotals>,
  today: string,
  currentComparisons: { previousMonth: MonthTotals; previousYear: MonthTotals },
): ExecutiveMonth[] {
  const current = today.slice(0, 7);
  parseDate(today);
  return Array.from({ length: EXECUTIVE_MONTHS }, (_, index) => {
    const month = shiftMonth(current, -index);
    const totals = buckets.get(month) ?? EMPTY_TOTALS;
    const partial = month === current;
    const previousMonth = partial ? currentComparisons.previousMonth : buckets.get(shiftMonth(month, -1)) ?? EMPTY_TOTALS;
    const previousYear = partial ? currentComparisons.previousYear : buckets.get(shiftMonth(month, -12)) ?? EMPTY_TOTALS;
    return {
      month, partial, ...totals, marginPercent: marginPercent(totals), previousMonth, previousYear,
      salesVsPreviousMonth: percentChange(totals.sales, previousMonth.sales),
      salesVsPreviousYear: percentChange(totals.sales, previousYear.sales),
      profitVsPreviousMonth: percentChange(totals.profit, previousMonth.profit),
      profitVsPreviousYear: percentChange(totals.profit, previousYear.profit),
    };
  });
}

/** Vista del rol Cartera: facturación, cartera y pendientes, sin costos, utilidad ni márgenes. */
export function salesOnlySummary(summary: ExecutiveSummary): ExecutiveSummary {
  const hide = (totals: MonthTotals): MonthTotals => ({ ...totals, cost: 0, profit: 0 });
  return {
    ...summary,
    scope: 'sales',
    months: summary.months.map(month => ({
      ...month, cost: 0, profit: 0, marginPercent: null, profitVsPreviousMonth: null, profitVsPreviousYear: null,
      previousMonth: hide(month.previousMonth), previousYear: hide(month.previousYear),
    })),
  };
}

/** Días calendario entre dos fechas YYYY-MM-DD (negativo si `from` es posterior). */
export function daysBetween(from: string, to: string): number {
  parseDate(from);
  parseDate(to);
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function lastDayOfMonth(month: string): string {
  const { year, month: value } = parseDate(`${month}-01`);
  return `${month}-${pad(lastDay(year, value))}`;
}

/** Pedidos con saldo por facturar y más de `days` días desde su confirmación. */
export function staleOrders(orders: readonly ExecutiveOrderToInvoice[], days = STALE_ORDER_DAYS) {
  const stale = orders.filter(order => order.ageDays !== null && order.ageDays > days && order.amountToInvoice > 0);
  return {
    days, count: stale.length, amount: roundCurrency(stale.reduce((sum, order) => sum + order.amountToInvoice, 0)),
    orderNames: [...stale].sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0)).slice(0, 3).map(order => order.name),
  };
}

const sumTotals = (rows: readonly MonthTotals[]): MonthTotals => ({
  sales: roundCurrency(rows.reduce((sum, row) => sum + row.sales, 0)),
  cost: roundCurrency(rows.reduce((sum, row) => sum + row.cost, 0)),
  profit: roundCurrency(rows.reduce((sum, row) => sum + row.profit, 0)),
  documents: rows.reduce((sum, row) => sum + row.documents, 0),
});

/**
 * Indicadores por período a partir de los 12 meses ya consultados:
 * mes en curso (vs mismo período), mes anterior (vs su mes anterior y año anterior)
 * y año a la fecha (vs el mismo período del año anterior).
 */
export function buildPeriodKpis(months: readonly ExecutiveMonth[], formatMonth: (month: string) => string = month => month): PeriodKpi[] {
  const [current, previous] = months;
  if (!current || !previous) return [];
  const year = current.month.slice(0, 4);
  const ytd = months.filter(row => row.month.startsWith(`${year}-`));
  const kpi = (period: KpiPeriod, label: string, totals: MonthTotals, comparisons: PeriodKpi['comparisons']): PeriodKpi => ({
    period, label, totals, marginPercent: marginPercent(totals), comparisons,
  });
  return [
    kpi('mes', `Mes en curso · ${formatMonth(current.month)}`, current, [
      { label: formatMonth(previous.month), totals: current.previousMonth },
      { label: formatMonth(shiftMonth(current.month, -12)), totals: current.previousYear },
    ]),
    kpi('mes_anterior', `Mes anterior · ${formatMonth(previous.month)}`, previous, [
      { label: formatMonth(shiftMonth(previous.month, -1)), totals: previous.previousMonth },
      { label: formatMonth(shiftMonth(previous.month, -12)), totals: previous.previousYear },
    ]),
    kpi('anio', `Año a la fecha · ${year}`, sumTotals(ytd), [
      { label: `${Number(year) - 1} (mismo período)`, totals: sumTotals(ytd.map(row => row.previousYear)) },
    ]),
  ];
}
