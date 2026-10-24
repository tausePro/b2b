import { roundCurrency } from './bonoPlataforma';
import type { FinancialLine, FinancialRange } from '@/lib/gerencia/finanzas';

export const PACKAGING_CATEGORY_ID = 132;
export type RegularCommissionKind = 'general' | 'generic_toner' | 'packaging' | 'unknown';
export const REGULAR_COMMISSION_LABELS: Record<RegularCommissionKind, string> = {
  general: 'General', generic_toner: 'Tóner genéricos', packaging: 'Soluciones de Empaques', unknown: 'Categoría pendiente',
};

export interface RegularCommissionBreakdown {
  kind: RegularCommissionKind;
  rate: number | null;
  netSales: number;
  invoicedSales: number;
  creditNotes: number;
  commission: number | null;
  knownCommission: number;
  missingCommissionLines: number;
  lineCount: number;
  invoiceCount: number;
  creditNoteCount: number;
}

export interface PackagingCommissionPayment extends RegularCommissionBreakdown {
  advisorId: number | null;
  advisorName: string;
  portalAdvisorId: string | null;
  invoiceMonth: string;
  paymentMonth: string;
  completeMonth: boolean;
}

export interface RegularCommissionAdvisor {
  id: number | null;
  name: string;
  portalAdvisorId: string | null;
  breakdown: RegularCommissionBreakdown[];
}

export interface RegularCommissionReport {
  period: string;
  paymentPeriod: string;
  range: FinancialRange;
  completeMonth: boolean;
  currency: 'COP';
  generatedAt: string;
  advisorId: string | null;
  canViewTeam: boolean;
  breakdown: RegularCommissionBreakdown[];
  advisors: RegularCommissionAdvisor[];
  payments: PackagingCommissionPayment[];
}

export function regularCommissionKind(categoryId: number | null, tonerCategories: ReadonlySet<number>, packagingCategories: ReadonlySet<number>): RegularCommissionKind {
  if (categoryId === null) return 'unknown';
  if (packagingCategories.has(categoryId)) return 'packaging';
  return tonerCategories.has(categoryId) ? 'generic_toner' : 'general';
}

function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('La fecha no existe.');
  return date;
}

export function nextCommissionMonth(invoiceDate: string): string {
  const date = calendarDate(invoiceDate);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

export function regularCommissionPeriod(period: string, today: string): FinancialRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period < '1900-01' || period > today.slice(0, 7)) {
    throw new Error('Selecciona un mes de facturación válido, sin períodos futuros.');
  }
  calendarDate(today);
  const start = calendarDate(`${period}-01`);
  start.setUTCMonth(start.getUTCMonth() + 1, 0);
  const last = start.toISOString().slice(0, 10);
  return { from: `${period}-01`, to: last > today ? today : last };
}

export function summarizeRegularCommissions(lines: readonly FinancialLine[]): RegularCommissionBreakdown[] {
  const kinds: RegularCommissionKind[] = ['general', 'generic_toner', 'packaging', 'unknown'];
  const buckets = new Map(kinds.map(kind => [kind, {
    kind, rate: kind === 'unknown' ? null : kind === 'general' ? 1 : 2,
    netSales: 0, invoicedSales: 0, creditNotes: 0, knownCommission: 0,
    missingCommissionLines: 0, lineCount: 0, invoices: new Set<number>(), credits: new Set<number>(),
  }]));
  for (const line of lines) {
    const bucket = buckets.get(line.commissionKind);
    if (!bucket) throw new Error('La regla de comisión de una línea no está identificada.');
    bucket.netSales += line.netSales;
    bucket.lineCount++;
    if (line.documentType === 'out_refund') {
      bucket.creditNotes += line.netSales;
      bucket.credits.add(line.invoiceId);
    } else {
      bucket.invoicedSales += line.netSales;
      bucket.invoices.add(line.invoiceId);
    }
    if (line.commission === null) bucket.missingCommissionLines++;
    else bucket.knownCommission += line.commission;
  }
  return [...buckets.values()].map(bucket => ({
    kind: bucket.kind, rate: bucket.rate,
    netSales: roundCurrency(bucket.netSales), invoicedSales: roundCurrency(bucket.invoicedSales), creditNotes: roundCurrency(bucket.creditNotes),
    commission: bucket.missingCommissionLines ? null : roundCurrency(bucket.knownCommission),
    knownCommission: roundCurrency(bucket.knownCommission), missingCommissionLines: bucket.missingCommissionLines,
    lineCount: bucket.lineCount, invoiceCount: bucket.invoices.size, creditNoteCount: bucket.credits.size,
  }));
}

export function packagingPaymentSchedule(lines: readonly FinancialLine[], range: FinancialRange): PackagingCommissionPayment[] {
  const groups = new Map<string, FinancialLine[]>();
  for (const line of lines) {
    if (line.commissionKind !== 'packaging') continue;
    const key = `${line.advisorId ?? 'none'}:${line.invoiceDate.slice(0, 7)}`;
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const first = group[0];
    const invoiceMonth = first.invoiceDate.slice(0, 7);
    const end = calendarDate(`${invoiceMonth}-01`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    return {
      ...summarizeRegularCommissions(group).find(bucket => bucket.kind === 'packaging')!,
      advisorId: first.advisorId, advisorName: first.advisorName, portalAdvisorId: first.portalAdvisorId,
      invoiceMonth, paymentMonth: nextCommissionMonth(first.invoiceDate),
      completeMonth: range.from <= `${invoiceMonth}-01` && range.to >= end.toISOString().slice(0, 10),
    };
  }).sort((a, b) => a.paymentMonth.localeCompare(b.paymentMonth) || a.advisorName.localeCompare(b.advisorName, 'es'));
}
