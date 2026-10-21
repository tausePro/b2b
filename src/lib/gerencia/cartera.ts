import { roundCurrency } from '@/lib/comisiones/bonoPlataforma';

export type BalanceSide = 'receivable' | 'payable';
export type BalanceStatus = 'all' | 'overdue' | 'not_due' | 'credit' | 'no_due_date';
export const BALANCE_PAGE_SIZE = 50;

export interface OpenBalanceLine {
  id: number;
  side: BalanceSide;
  companyId: number;
  companyName: string;
  partnerId: number | null;
  partnerName: string;
  documentId: number;
  documentName: string;
  reference: string | null;
  documentType: string;
  accountName: string;
  date: string;
  dueDate: string | null;
  daysOverdue: number | null;
  balance: number;
}

export interface OpenBalanceTotals {
  balance: number;
  charges: number;
  credits: number;
  overdue: number;
  notDue: number;
  withoutDueDate: number;
  lineCount: number;
  documentCount: number;
  partnerCount: number;
  aging: { label: string; amount: number }[];
}

export interface OpenBalanceFilters { side: BalanceSide; status: BalanceStatus; search: string; page: number }
export interface OpenBalanceReport {
  currency: 'COP';
  asOfDate: string;
  generatedAt: string;
  filters: OpenBalanceFilters;
  receivable: OpenBalanceTotals;
  payable: OpenBalanceTotals;
  lines: OpenBalanceLine[];
  filteredBalance: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  warnings: string[];
}

export function overdueDays(dueDate: string | null, today: string): number | null {
  const parse = (value: string) => {
    const date = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value) {
      throw new Error('Fecha contable no válida.');
    }
    return date;
  };
  const end = parse(today);
  return dueDate === null ? null : Math.max(0, (end - parse(dueDate)) / 86400000);
}

export function summarizeOpenBalances(lines: readonly OpenBalanceLine[]): OpenBalanceTotals {
  const aging = ['1–30 días', '31–60 días', '61–90 días', 'Más de 90 días'].map(label => ({ label, amount: 0 }));
  let charges = 0, credits = 0, overdue = 0, notDue = 0, withoutDueDate = 0;
  for (const line of lines) {
    if (!Number.isFinite(line.balance)) throw new Error('Saldo contable no válido.');
    if (line.balance < 0) { credits += line.balance; continue; }
    charges += line.balance;
    if (line.daysOverdue === null) withoutDueDate += line.balance;
    else if (line.daysOverdue === 0) notDue += line.balance;
    else {
      overdue += line.balance;
      const index = line.daysOverdue <= 30 ? 0 : line.daysOverdue <= 60 ? 1 : line.daysOverdue <= 90 ? 2 : 3;
      aging[index].amount += line.balance;
    }
  }
  return {
    balance: roundCurrency(charges + credits), charges: roundCurrency(charges), credits: roundCurrency(credits),
    overdue: roundCurrency(overdue), notDue: roundCurrency(notDue), withoutDueDate: roundCurrency(withoutDueDate),
    lineCount: lines.length, documentCount: new Set(lines.map(line => line.documentId)).size,
    partnerCount: new Set(lines.flatMap(line => line.partnerId === null ? [] : [`${line.companyId}:${line.partnerId}`])).size,
    aging: aging.map(bucket => ({ ...bucket, amount: roundCurrency(bucket.amount) })),
  };
}

export function buildOpenBalanceReport(
  lines: readonly OpenBalanceLine[], asOfDate: string, generatedAt: string, filters: OpenBalanceFilters,
): OpenBalanceReport {
  if (!Number.isSafeInteger(filters.page) || filters.page < 1) throw new Error('Página no válida.');
  if (new Set(lines.map(line => line.id)).size !== lines.length) throw new Error('Hay partidas contables duplicadas.');
  const search = filters.search.trim().toLocaleLowerCase('es');
  const selected = lines.filter(line => line.side === filters.side
    && `${line.partnerName} ${line.documentName} ${line.reference ?? ''} ${line.accountName}`.toLocaleLowerCase('es').includes(search)
    && (filters.status === 'all'
      || (filters.status === 'credit' && line.balance < 0)
      || (line.balance > 0 && (
        (filters.status === 'overdue' && line.daysOverdue !== null && line.daysOverdue > 0)
        || (filters.status === 'not_due' && line.daysOverdue === 0)
        || (filters.status === 'no_due_date' && line.daysOverdue === null)
      ))));
  const ordered = [...selected].sort((a, b) => {
    const overdueA = a.balance > 0 ? a.daysOverdue ?? -1 : -2;
    const overdueB = b.balance > 0 ? b.daysOverdue ?? -1 : -2;
    return overdueB - overdueA || b.balance - a.balance || a.id - b.id;
  });
  const totalPages = Math.max(1, Math.ceil(selected.length / BALANCE_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  return {
    currency: 'COP', asOfDate, generatedAt, filters: { ...filters, page },
    receivable: summarizeOpenBalances(lines.filter(line => line.side === 'receivable')),
    payable: summarizeOpenBalances(lines.filter(line => line.side === 'payable')),
    filteredBalance: roundCurrency(selected.reduce((sum, line) => sum + line.balance, 0)),
    lines: ordered.slice((page - 1) * BALANCE_PAGE_SIZE, page * BALANCE_PAGE_SIZE),
    pagination: { page, pageSize: BALANCE_PAGE_SIZE, total: selected.length, totalPages },
    warnings: [
      'Saldos abiertos actuales de cuentas por cobrar y pagar, con asientos publicados hasta hoy. Incluyen impuestos, retenciones y pagos aplicados; no corresponden al rango ni a los filtros de ventas.',
      'El saldo neto incorpora abonos y notas crédito pendientes de conciliación. Los vencidos y su antigüedad muestran cargos positivos, sin compensar automáticamente abonos de otros documentos.',
      'Esta consulta no reconstruye cartera histórica, no concilia partidas ni registra cobros o pagos.',
    ],
  };
}
