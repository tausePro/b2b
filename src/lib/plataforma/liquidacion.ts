import { escapeCsvCell } from '@/lib/informes/pedidos';

/**
 * Liquidación mensual de la plataforma (acuerdo Tause–Imprima).
 * - Cliente de plataforma: empresa del portal desde el mes de su primer pedido aprobado por la plataforma.
 * - Base: valor neto (sin IVA, menos notas crédito) facturado en Odoo en el mes calendario por pedidos de la plataforma.
 * - Menos de $500.000 → $25.000; desde $500.000 → $50.000.
 * - Con más de 2 meses calendario consecutivos sin pedir, el cliente no paga hasta que vuelva a pedir.
 */
export const PLATFORM_FEE_LOW = 25_000;
export const PLATFORM_FEE_HIGH = 50_000;
export const PLATFORM_FEE_THRESHOLD = 500_000;
export const PLATFORM_GRACE_MONTHS = 2;

export type LiquidationStatus = 'pidio' | 'gracia' | 'no_paga';

export interface LiquidationInvoice { name: string; date: string; net: number }
export interface LiquidationClientInput {
  companyId: string;
  name: string;
  activationMonth: string;
  orderMonths: readonly string[];
  ordersInMonth: number;
  netInvoiced: number;
  invoices: LiquidationInvoice[];
}
export interface LiquidationClient extends Omit<LiquidationClientInput, 'orderMonths'> {
  status: LiquidationStatus;
  monthsWithoutOrders: number;
  fee: number;
}
export interface LiquidationSummary {
  clients: number;
  paying: number;
  highFee: number;
  lowFee: number;
  notPaying: number;
  totalFee: number;
  totalNet: number;
}

export const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

const bogotaMonthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' });
/** Mes calendario en Bogotá de una fecha/hora ISO (los pedidos guardan la hora en UTC). */
export const bogotaMonth = (iso: string) => bogotaMonthFormatter.format(new Date(iso));

/** El día 1 (y todo el mes) se muestra por defecto el mes anterior, ya cerrado, para facturar. */
export const defaultLiquidationMonth = (today: string) => addMonths(today.slice(0, 7), -1);

export const platformFee = (netInvoiced: number) => (netInvoiced >= PLATFORM_FEE_THRESHOLD ? PLATFORM_FEE_HIGH : PLATFORM_FEE_LOW);

/** Meses calendario seguidos sin pedidos hasta `month` inclusive, sin contar los anteriores a la activación. */
export function consecutiveMonthsWithoutOrders(orderMonths: Iterable<string>, month: string, activationMonth: string): number {
  const ordered = new Set(orderMonths);
  let count = 0;
  for (let cursor = month; cursor >= activationMonth && !ordered.has(cursor); cursor = addMonths(cursor, -1)) count++;
  return count;
}

/** Liquida un cliente en el mes; null si todavía no era cliente de la plataforma (sin pedidos hasta ese mes). */
export function liquidateClient(input: LiquidationClientInput, month: string): LiquidationClient | null {
  if (input.activationMonth > month) return null;
  const monthsWithoutOrders = consecutiveMonthsWithoutOrders(input.orderMonths, month, input.activationMonth);
  const status: LiquidationStatus = monthsWithoutOrders === 0 ? 'pidio' : monthsWithoutOrders <= PLATFORM_GRACE_MONTHS ? 'gracia' : 'no_paga';
  const { orderMonths: _orderMonths, ...client } = input;
  void _orderMonths;
  return { ...client, status, monthsWithoutOrders, fee: status === 'no_paga' ? 0 : platformFee(input.netInvoiced) };
}

export function summarizeLiquidation(clients: readonly LiquidationClient[]): LiquidationSummary {
  const paying = clients.filter(client => client.fee > 0);
  return {
    clients: clients.length,
    paying: paying.length,
    highFee: paying.filter(client => client.fee === PLATFORM_FEE_HIGH).length,
    lowFee: paying.filter(client => client.fee === PLATFORM_FEE_LOW).length,
    notPaying: clients.length - paying.length,
    totalFee: paying.reduce((sum, client) => sum + client.fee, 0),
    totalNet: Math.round(clients.reduce((sum, client) => sum + client.netInvoiced, 0) * 100) / 100,
  };
}

export const LIQUIDATION_STATUS_LABELS: Record<LiquidationStatus, string> = { pidio: 'Pidió en el mes', gracia: 'Sin pedidos (paga)', no_paga: 'No paga' };

export function buildLiquidationCsv(month: string, clients: readonly LiquidationClient[]): string {
  const headers = ['Mes', 'Cliente', 'Primer pedido', 'Pedidos del mes', 'Neto facturado del mes (sin IVA)', 'Meses seguidos sin pedir', 'Estado', 'Valor a cobrar', 'Facturas'];
  const rows = clients.map(client => [
    month, client.name, client.activationMonth, String(client.ordersInMonth), client.netInvoiced.toFixed(2), String(client.monthsWithoutOrders),
    LIQUIDATION_STATUS_LABELS[client.status], String(client.fee), client.invoices.map(invoice => invoice.name).join(' '),
  ]);
  const total = summarizeLiquidation(clients);
  rows.push(['', 'TOTAL', '', '', total.totalNet.toFixed(2), '', '', String(total.totalFee), '']);
  return `\uFEFF${[headers, ...rows].map(row => row.map(escapeCsvCell).join(';')).join('\r\n')}`;
}
