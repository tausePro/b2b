import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import {
  LOW_MARGIN_COMMISSION_RATE, LOW_MARGIN_COMMISSION_THRESHOLD, PACKAGING_CATEGORY_ID, packagingPaymentSchedule, regularCommissionKind, summarizeRegularCommissions,
  type PackagingCommissionPayment, type RegularCommissionBreakdown, type RegularCommissionKind,
} from '@/lib/comisiones/habitual';

export const GENERIC_TONER_CATEGORY_ID = 26;
export const FINANCIAL_MAX_DAYS = 366;
export const FINANCIAL_PAGE_SIZE = 100;
export const FINANCIAL_DAILY_TREND_MAX_DAYS = 62;
export const ZERO_RECORDED_COST_ISSUE = 'Mercancía con costo cero en Odoo: la venta completa cuenta como utilidad, igual que en Odoo. Revisa si el producto requiere costo.';
export const PENDING_MARGIN_COMMISSION_ISSUE = 'Comisión pendiente: sin costo verificado no se puede confirmar si el margen es menor al 15% (0,5%) o no (1%).';

export type FinancialChannel = 'portal' | 'mixed' | 'other';
export interface FinancialRange { from: string; to: string }
export interface FinancialFilters {
  advisorId?: number | null;
  clientId?: number;
  productId?: number;
  invoiceId?: number;
  onlyMissingCost?: boolean;
  page: number;
}
export interface FinancialLine {
  id: number;
  invoiceId: number;
  invoiceName: string;
  invoiceDate: string;
  documentType: 'out_invoice' | 'out_refund';
  companyId: number;
  companyName: string;
  advisorId: number | null;
  advisorName: string;
  portalAdvisorId: string | null;
  clientId: number | null;
  clientName: string;
  productId: number | null;
  productName: string;
  sku: string | null;
  isService: boolean;
  categoryId: number | null;
  categoryName: string | null;
  unitId: number | null;
  unitName: string;
  quantity: number;
  netSales: number;
  unitCost: number | null;
  cost: number | null;
  profit: number | null;
  marginPercent: number | null;
  commissionRate: number | null;
  commissionKind: RegularCommissionKind;
  commissionPaymentMonth: string | null;
  commission: number | null;
  channel: FinancialChannel;
  issues: string[];
}
export interface FinancialTotals {
  netSales: number;
  invoicedSales: number;
  creditNotes: number;
  invoiceCount: number;
  creditNoteCount: number;
  clientCount: number;
  lineCount: number;
  cost: number | null;
  profit: number | null;
  knownCost: number;
  verifiedProfit: number;
  verifiedSales: number;
  unverifiedSales: number;
  verifiedMarginPercent: number | null;
  missingCostInvoices: number;
  marginPercent: number | null;
  costCoveragePercent: number | null;
  missingCostLines: number;
  commission: number | null;
  knownCommission: number;
  missingCommissionLines: number;
  averageInvoice: number | null;
}
export interface FinancialGroup extends FinancialTotals {
  key: string;
  id: number | null;
  name: string;
  portalAdvisorId?: string | null;
  sku?: string | null;
  categoryName?: string | null;
  unitName?: string;
  quantity?: number;
  commissionBreakdown?: RegularCommissionBreakdown[];
}
export interface FinancialCostReview {
  zeroCostGoodsLines: number;
  zeroCostGoodsInvoices: number;
  zeroCostGoodsSales: number;
  zeroCostServiceLines: number;
  zeroCostServiceSales: number;
  products: FinancialGroup[];
}
export interface FinancialCompany { id: number; name: string }
export interface FinancialTrend { date: string; netSales: number; profit: number | null; commission: number | null }
export interface FinancialAdvisor { id: number; name: string; portalAdvisorId: string | null }
export interface FinancialReport {
  selectedAdvisor?: FinancialAdvisor | null;
  company?: FinancialCompany;
  range: FinancialRange;
  previousRange: FinancialRange;
  comparisonMode: 'calendar_months' | 'month_progress' | 'equal_days';
  filters: FinancialFilters;
  currency: 'COP';
  generatedAt: string;
  totals: FinancialTotals;
  previousTotals: FinancialTotals;
  commissionBreakdown: RegularCommissionBreakdown[];
  packagingPayments: PackagingCommissionPayment[];
  advisors: FinancialGroup[];
  clients: FinancialGroup[];
  products: FinancialGroup[];
  costReview: FinancialCostReview;
  trendGranularity: 'day' | 'month';
  trend: FinancialTrend[];
  lines: FinancialLine[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  warnings: string[];
}
export interface CompactRows { fields: string[]; rows: unknown[][] }
export type FinancialReportWire = Omit<FinancialReport, 'advisors' | 'clients' | 'products' | 'costReview'> & {
  advisors: CompactRows;
  clients: CompactRows;
  products: CompactRows;
  costReview: Omit<FinancialCostReview, 'products'> & { products: CompactRows };
};

function calendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Usa fechas válidas con formato AAAA-MM-DD.');
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error('La fecha no existe en el calendario.');
  return timestamp;
}

export function defaultFinancialRange(today = getBogotaCalendarDate()): FinancialRange {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function validateFinancialRange(from: string, to: string, today = getBogotaCalendarDate()): FinancialRange {
  const start = calendarDate(from);
  const end = calendarDate(to);
  if (from < '1900-01-01') throw new Error('La fecha inicial debe ser posterior a 1899.');
  if (start > end) throw new Error('La fecha inicial no puede ser posterior a la final.');
  if (to > today) throw new Error('La fecha final no puede superar hoy en Colombia.');
  if ((end - start) / 86400000 + 1 > FINANCIAL_MAX_DAYS) throw new Error(`Consulta como máximo ${FINANCIAL_MAX_DAYS} días por rango.`);
  return { from, to };
}

export function financialComparison(range: FinancialRange): { range: FinancialRange; mode: FinancialReport['comparisonMode'] } {
  const start = calendarDate(range.from);
  const end = calendarDate(range.to);
  if (end < start) throw new Error('La fecha inicial no puede ser posterior a la final.');
  const first = new Date(start);
  const last = new Date(end);
  const lastDay = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (first.getUTCDate() === 1 && last.getUTCDate() === lastDay) {
    const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
    return {
      range: { from: iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - months, 1))), to: iso(new Date(start - 86400000)) },
      mode: 'calendar_months',
    };
  }
  if (first.getUTCDate() === 1 && range.from.slice(0, 7) === range.to.slice(0, 7)) {
    const previousEnd = new Date(start - 86400000);
    return {
      range: {
        from: iso(new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), 1))),
        to: iso(new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), Math.min(last.getUTCDate(), previousEnd.getUTCDate())))),
      },
      mode: 'month_progress',
    };
  }
  const days = (end - start) / 86400000 + 1;
  return {
    range: { from: iso(new Date(start - days * 86400000)), to: iso(new Date(start - 86400000)) },
    mode: 'equal_days',
  };
}

export function previousFinancialRange(range: FinancialRange): FinancialRange {
  return financialComparison(range).range;
}

export function regularCommissionRate(categoryId: number | null, genericCategoryIds: ReadonlySet<number>, packagingCategoryIds: ReadonlySet<number> = new Set([PACKAGING_CATEGORY_ID])): number | null {
  const kind = regularCommissionKind(categoryId, genericCategoryIds, packagingCategoryIds);
  return kind === 'unknown' ? null : kind === 'general' ? 1 : 2;
}

export function calculateRegularCommission(base: number, rate: number | null): number | null {
  if (!Number.isFinite(base)) throw new Error('La base de comisión no es válida.');
  if (rate === null) return null;
  if (rate !== LOW_MARGIN_COMMISSION_RATE && rate !== 1 && rate !== 2) throw new Error('La tasa habitual debe ser 0,5%, 1% o 2%.');
  return roundCurrency(base * rate / 100);
}

export function lineCommissionRule(categoryKind: RegularCommissionKind, netSales: number, profit: number | null): { kind: RegularCommissionKind; rate: number | null } {
  if (categoryKind === 'unknown') return { kind: 'unknown', rate: null };
  if (categoryKind !== 'general') return { kind: categoryKind, rate: 2 };
  if (netSales === 0) return { kind: 'general', rate: 1 };
  if (profit === null) return { kind: 'general', rate: null };
  return roundCurrency(profit / netSales * 100) < LOW_MARGIN_COMMISSION_THRESHOLD
    ? { kind: 'low_margin', rate: LOW_MARGIN_COMMISSION_RATE }
    : { kind: 'general', rate: 1 };
}

export function financialMargin(profit: number | null, sales: number): number | null {
  return profit === null || sales <= 0 ? null : roundCurrency(profit / sales * 100);
}

export function hasZeroRecordedCost(line: Pick<FinancialLine, 'cost' | 'netSales'>): boolean {
  return line.cost === 0 && line.netSales !== 0;
}

export function isZeroCostService(line: Pick<FinancialLine, 'cost' | 'netSales' | 'isService'>): boolean {
  return line.isService && hasZeroRecordedCost(line);
}

export function needsCostReview(line: Pick<FinancialLine, 'cost' | 'profit' | 'netSales' | 'isService'>): boolean {
  return line.cost === null || line.profit === null || (hasZeroRecordedCost(line) && !line.isService);
}

function compactRows(rows: readonly object[]): CompactRows {
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return { fields, rows: rows.map(row => fields.map(field => (row as Record<string, unknown>)[field] ?? null)) };
}

function expandRows<T>(compact: CompactRows): T[] {
  if (!compact || !Array.isArray(compact.fields) || !Array.isArray(compact.rows)
    || compact.fields.some(field => typeof field !== 'string')
    || compact.rows.some(row => !Array.isArray(row) || row.length !== compact.fields.length)) {
    throw new Error('El servicio no devolvió un reporte válido. Intenta actualizar.');
  }
  return compact.rows.map(row => Object.fromEntries(compact.fields.map((field, index) => [field, row[index]])) as T);
}

export function encodeFinancialReport(report: FinancialReport): FinancialReportWire {
  return {
    ...report,
    advisors: compactRows(report.advisors), clients: compactRows(report.clients), products: compactRows(report.products),
    costReview: { ...report.costReview, products: compactRows(report.costReview.products) },
  };
}

export function decodeFinancialReport(wire: FinancialReportWire): FinancialReport {
  if (!wire || typeof wire !== 'object' || !wire.costReview || typeof wire.costReview !== 'object') {
    throw new Error('El servicio no devolvió un reporte válido. Intenta actualizar.');
  }
  return {
    ...wire,
    advisors: expandRows<FinancialGroup>(wire.advisors), clients: expandRows<FinancialGroup>(wire.clients),
    products: expandRows<FinancialGroup>(wire.products),
    costReview: { ...wire.costReview, products: expandRows<FinancialGroup>(wire.costReview.products) },
  };
}

export function summarizeFinancialLines(lines: readonly FinancialLine[]): FinancialTotals {
  const invoiceIds = new Set<number>();
  const creditIds = new Set<number>();
  const clients = new Set<number>();
  let netSales = 0;
  let invoicedSales = 0;
  let creditNotes = 0;
  let knownCost = 0;
  let verifiedProfit = 0;
  let verifiedSales = 0;
  const missingCostInvoices = new Set<number>();
  let knownCommission = 0;
  let missingCostLines = 0;
  let missingCommissionLines = 0;
  let coveredSales = 0;
  let absoluteSales = 0;
  for (const line of lines) {
    netSales += line.netSales;
    absoluteSales += Math.abs(line.netSales);
    if (line.documentType === 'out_invoice') {
      invoiceIds.add(line.invoiceId);
      invoicedSales += line.netSales;
    } else {
      creditIds.add(line.invoiceId);
      creditNotes += line.netSales;
    }
    if (line.clientId !== null) clients.add(line.clientId);
    if (line.cost === null || line.profit === null) {
      missingCostLines++;
      missingCostInvoices.add(line.invoiceId);
    }
    else {
      knownCost += line.cost;
      verifiedProfit += line.profit;
      verifiedSales += line.netSales;
      coveredSales += Math.abs(line.netSales);
    }
    if (line.commission === null) missingCommissionLines++;
    else knownCommission += line.commission;
  }
  netSales = roundCurrency(netSales);
  knownCost = roundCurrency(knownCost);
  verifiedProfit = roundCurrency(verifiedProfit);
  verifiedSales = roundCurrency(verifiedSales);
  const profit = missingCostLines ? null : verifiedProfit;
  return {
    netSales, invoicedSales: roundCurrency(invoicedSales), creditNotes: roundCurrency(creditNotes),
    invoiceCount: invoiceIds.size, creditNoteCount: creditIds.size, clientCount: clients.size, lineCount: lines.length,
    cost: missingCostLines ? null : knownCost, profit, knownCost, verifiedProfit,
    verifiedSales, unverifiedSales: roundCurrency(netSales - verifiedSales),
    verifiedMarginPercent: financialMargin(verifiedProfit, verifiedSales), missingCostInvoices: missingCostInvoices.size,
    marginPercent: financialMargin(profit, netSales),
    costCoveragePercent: lines.length ? (absoluteSales ? roundCurrency(coveredSales / absoluteSales * 100) : missingCostLines ? 0 : 100) : null,
    missingCostLines, commission: missingCommissionLines ? null : roundCurrency(knownCommission),
    knownCommission: roundCurrency(knownCommission), missingCommissionLines,
    averageInvoice: invoiceIds.size ? roundCurrency(invoicedSales / invoiceIds.size) : null,
  };
}

export function filterFinancialLines(lines: readonly FinancialLine[], filters: FinancialFilters): FinancialLine[] {
  return lines.filter((line) => (filters.advisorId === undefined || line.advisorId === filters.advisorId)
    && (filters.clientId === undefined || line.clientId === filters.clientId)
    && (filters.productId === undefined || line.productId === filters.productId)
    && (filters.invoiceId === undefined || line.invoiceId === filters.invoiceId));
}

function groupFinancialLines(lines: readonly FinancialLine[], kind: 'advisor' | 'client' | 'product', withCategory = false): FinancialGroup[] {
  const groups = new Map<string, { first: FinancialLine; lines: FinancialLine[] }>();
  for (const line of lines) {
    const id = kind === 'advisor' ? line.advisorId : kind === 'client' ? line.clientId : line.productId;
    const key = `${id ?? 'none'}${kind === 'product' ? `:${line.unitId ?? 'none'}` : ''}`;
    const group = groups.get(key) ?? { first: line, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups].map(([key, { first, lines: grouped }]) => ({
    key,
    id: kind === 'advisor' ? first.advisorId : kind === 'client' ? first.clientId : first.productId,
    name: kind === 'advisor' ? first.advisorName : kind === 'client' ? first.clientName : first.productId === null ? 'Líneas sin producto identificado' : first.productName,
    ...(kind === 'advisor' ? { portalAdvisorId: first.portalAdvisorId, commissionBreakdown: summarizeRegularCommissions(grouped) } : {}),
    ...(kind === 'product' ? { sku: first.sku, unitName: first.unitName, quantity: Number(grouped.reduce((total, line) => total + line.quantity, 0).toPrecision(15)) } : {}),
    ...(withCategory ? { categoryName: first.categoryName } : {}),
    ...summarizeFinancialLines(grouped),
  })).sort((a, b) => b.netSales - a.netSales || a.name.localeCompare(b.name, 'es'));
}

export function buildFinancialReport(allLines: readonly FinancialLine[], range: FinancialRange, filters: FinancialFilters, generatedAt: string, warnings: string[] = []): FinancialReport {
  if (!Number.isSafeInteger(filters.page) || filters.page < 1) throw new Error('La página solicitada no es válida.');
  const seen = new Set<number>();
  for (const line of allLines) {
    if (seen.has(line.id)) throw new Error('Odoo devolvió una línea de factura duplicada.');
    seen.add(line.id);
  }
  const comparison = financialComparison(range);
  const previousRange = comparison.range;
  const filtered = filterFinancialLines(allLines, filters);
  const current = filtered.filter((line) => line.invoiceDate >= range.from && line.invoiceDate <= range.to);
  const previous = filtered.filter((line) => line.invoiceDate >= previousRange.from && line.invoiceDate <= previousRange.to);
  const trendGranularity = (calendarDate(range.to) - calendarDate(range.from)) / 86400000 + 1 > FINANCIAL_DAILY_TREND_MAX_DAYS ? 'month' : 'day';
  const byDate = new Map<string, FinancialLine[]>();
  for (const line of current) {
    const key = trendGranularity === 'month' ? line.invoiceDate.slice(0, 7) : line.invoiceDate;
    const rows = byDate.get(key) ?? [];
    rows.push(line);
    byDate.set(key, rows);
  }
  const review = current.filter(needsCostReview);
  const zeroCostGoods = review.filter(hasZeroRecordedCost);
  const zeroCostServices = current.filter(isZeroCostService);
  const details = filters.onlyMissingCost ? review : current;
  const totalPages = Math.max(1, Math.ceil(details.length / FINANCIAL_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const ordered = [...details].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceId - a.invoiceId || a.id - b.id);
  return {
    range, previousRange, comparisonMode: comparison.mode, filters: { ...filters, page }, currency: 'COP', generatedAt,
    totals: summarizeFinancialLines(current), previousTotals: summarizeFinancialLines(previous),
    commissionBreakdown: summarizeRegularCommissions(current), packagingPayments: packagingPaymentSchedule(current, range),
    advisors: groupFinancialLines(current, 'advisor'), clients: groupFinancialLines(current, 'client'), products: groupFinancialLines(current, 'product'),
    costReview: {
      zeroCostGoodsLines: zeroCostGoods.length,
      zeroCostGoodsInvoices: new Set(zeroCostGoods.map(line => line.invoiceId)).size,
      zeroCostGoodsSales: roundCurrency(zeroCostGoods.reduce((total, line) => total + line.netSales, 0)),
      zeroCostServiceLines: zeroCostServices.length,
      zeroCostServiceSales: roundCurrency(zeroCostServices.reduce((total, line) => total + line.netSales, 0)),
      products: groupFinancialLines(review, 'product', true),
    },
    trendGranularity,
    trend: [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
      const totals = summarizeFinancialLines(rows);
      return { date, netSales: totals.netSales, profit: totals.profit, commission: totals.commission };
    }),
    lines: ordered.slice((page - 1) * FINANCIAL_PAGE_SIZE, page * FINANCIAL_PAGE_SIZE),
    pagination: { page, pageSize: FINANCIAL_PAGE_SIZE, total: details.length, totalPages },
    warnings: [...new Set(warnings)],
  };
}
