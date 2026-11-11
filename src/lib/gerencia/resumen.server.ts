import 'server-only';

import { authenticate, read, readGroup, searchCount, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import { odooDateTimeToBogotaDate } from '@/lib/compras/historial';
import { FinancialDataError, getOdooReportCompany } from './finanzas.server';
import {
  buildExecutiveMonths, EMPTY_TOTALS, executiveRange, samePeriod,
  type ExecutiveDraft, type ExecutiveSummary, type MonthTotals, type PeriodRange,
} from './resumen';

type Row = Record<string, unknown>;
const cache = new Map<string, { expires: number; promise: Promise<ExecutiveSummary> }>();
const SUM_FIELDS = ['amount_untaxed_signed:sum', 'cost_total:sum', 'margin_signed:sum'];

const relationId = (value: unknown) => (Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? value[0] as number : null);
const relationName = (value: unknown) => (Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null);

function amount(value: unknown, label: string): number {
  if (value === false || value === null || value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new FinancialDataError(`Odoo devolvió un valor no válido en ${label}.`);
  return roundCurrency(value);
}

function totalsFrom(row: Row | undefined): MonthTotals {
  if (!row) return EMPTY_TOTALS;
  return {
    sales: amount(row.amount_untaxed_signed, 'ventas'), cost: amount(row.cost_total, 'costo'),
    profit: amount(row.margin_signed, 'utilidad'), documents: Number(row.__count ?? 0),
  };
}

async function fetchSummary(session: OdooSession, company: { id: number; name: string }, today: string): Promise<ExecutiveSummary> {
  const range = executiveRange(today);
  const previousMonthRange = samePeriod(today, -1);
  const previousYearRange = samePeriod(today, -12);
  const invoices = (period: PeriodRange) => [
    ['company_id', '=', company.id], ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['invoice_date', '>=', period.from], ['invoice_date', '<=', period.to],
  ];
  const draftDomain = [['company_id', '=', company.id], ['state', '=', 'draft'], ['move_type', 'in', ['out_invoice', 'out_refund']]];
  const toInvoiceDomain = [['company_id', '=', company.id], ['order_id.state', '=', 'sale'], ['invoice_status', '=', 'to invoice']];
  const [monthly, previousMonthRows, previousYearRows, draftRows, draftGroups, toInvoiceTotals, toInvoiceOrders, toInvoiceAdvisors, orderCount] = await Promise.all([
    readGroup('account.move', invoices(range), SUM_FIELDS, ['invoice_date:month'], { session }),
    readGroup('account.move', invoices(previousMonthRange), SUM_FIELDS, [], { session }),
    readGroup('account.move', invoices(previousYearRange), SUM_FIELDS, [], { session }),
    searchRead('account.move', draftDomain, ['id', 'name', 'move_type', 'partner_id', 'invoice_user_id', 'invoice_date', 'amount_untaxed_signed', 'company_id', 'state'], {
      limit: 50, order: 'amount_untaxed_signed desc, id desc', session,
    }) as Promise<Row[]>,
    readGroup('account.move', draftDomain, ['amount_untaxed_signed:sum'], ['move_type'], { session }),
    readGroup('sale.order.line', toInvoiceDomain, ['untaxed_amount_to_invoice:sum'], [], { session }),
    readGroup('sale.order.line', toInvoiceDomain, ['untaxed_amount_to_invoice:sum'], ['order_id'], { orderby: 'untaxed_amount_to_invoice desc', limit: 10, session }),
    readGroup('sale.order.line', toInvoiceDomain, ['untaxed_amount_to_invoice:sum'], ['salesman_id'], { orderby: 'untaxed_amount_to_invoice desc', session }),
    searchCount('sale.order', [['company_id', '=', company.id], ['state', '=', 'sale'], ['invoice_status', '=', 'to invoice']], session),
  ]);

  const buckets = new Map<string, MonthTotals>();
  for (const row of monthly) {
    const month = (row.__range as Record<string, { from?: string }> | undefined)?.['invoice_date:month']?.from?.slice(0, 7);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new FinancialDataError('Odoo no devolvió el mes de un grupo de facturas.');
    buckets.set(month, totalsFrom(row));
  }

  const drafts: ExecutiveDraft[] = draftRows.map(row => {
    if (relationId(row.company_id) !== company.id || row.state !== 'draft') throw new FinancialDataError('Odoo devolvió un borrador de otra compañía o ya publicado.');
    const name = typeof row.name === 'string' && row.name && row.name !== '/' ? row.name : `Borrador #${row.id}`;
    return {
      id: Number(row.id), name, documentType: row.move_type === 'out_refund' ? 'out_refund' : 'out_invoice',
      partnerName: relationName(row.partner_id) ?? 'Sin cliente', advisorName: relationName(row.invoice_user_id),
      date: typeof row.invoice_date === 'string' ? row.invoice_date : null, untaxed: amount(row.amount_untaxed_signed, 'borradores'),
    };
  });
  const draftCount = (type: string) => draftGroups.filter(group => group.move_type === type).reduce((sum, group) => sum + Number(group.__count ?? 0), 0);

  const orderAmounts = new Map(toInvoiceOrders.map(group => [relationId(group.order_id), amount(group.untaxed_amount_to_invoice, 'pedidos por facturar')]));
  const orderIds = [...orderAmounts.keys()].filter((id): id is number => id !== null);
  const orderRows = orderIds.length ? await read('sale.order', orderIds, ['id', 'name', 'partner_id', 'user_id', 'date_order', 'company_id', 'state'], session) as Row[] : [];
  const orderById = new Map(orderRows.map(row => [Number(row.id), row]));
  const orders = orderIds.map(id => {
    const row = orderById.get(id);
    if (!row || relationId(row.company_id) !== company.id || row.state !== 'sale') throw new FinancialDataError('No se pudo validar un pedido pendiente por facturar.');
    return {
      id, name: String(row.name ?? ''), partnerName: relationName(row.partner_id) ?? 'Sin cliente', advisorName: relationName(row.user_id),
      date: odooDateTimeToBogotaDate(row.date_order), amountToInvoice: orderAmounts.get(id)!,
    };
  });

  return {
    currency: 'COP', scope: 'full', company, asOfDate: today, generatedAt: new Date().toISOString(),
    months: buildExecutiveMonths(buckets, today, { previousMonth: totalsFrom(previousMonthRows[0]), previousYear: totalsFrom(previousYearRows[0]) }),
    currentPeriod: { range: { from: `${today.slice(0, 7)}-01`, to: today }, previousMonthRange, previousYearRange },
    drafts: {
      count: draftCount('out_invoice') + draftCount('out_refund'), invoices: draftCount('out_invoice'), creditNotes: draftCount('out_refund'),
      untaxed: roundCurrency(draftGroups.reduce((sum, group) => sum + amount(group.amount_untaxed_signed, 'borradores'), 0)), items: drafts,
    },
    toInvoice: {
      orderCount, lineCount: Number(toInvoiceTotals[0]?.__count ?? 0), untaxed: amount(toInvoiceTotals[0]?.untaxed_amount_to_invoice, 'pendiente por facturar'), orders,
      byAdvisor: toInvoiceAdvisors.map(group => ({
        advisorId: relationId(group.salesman_id), advisorName: relationName(group.salesman_id) ?? 'Sin asesora',
        amount: amount(group.untaxed_amount_to_invoice, 'pendiente por asesora'), lineCount: Number(group.__count ?? 0),
      })),
    },
    warnings: [
      `Compañía Odoo consultada: ${company.name}.`,
      'Ventas, costo y utilidad: facturas publicadas, incluidas notas crédito, con los totales de cabecera de Odoo por fecha de factura.',
      'El mes en curso se compara con el mismo período (del día 1 al día de hoy) del mes anterior y del mismo mes del año anterior.',
      'Pendiente por facturar: saldo sin IVA de las líneas de pedidos confirmados que Odoo marca "por facturar". Borradores: facturas y notas crédito sin publicar; no cuentan en ventas.',
    ],
  };
}

export async function loadExecutiveSummary(useCache = true): Promise<ExecutiveSummary> {
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const company = await getOdooReportCompany(session);
  const today = getBogotaCalendarDate();
  const key = `${company.id}:${today}`;
  const previous = cache.get(key);
  if (useCache && previous && previous.expires > Date.now()) return previous.promise;
  const promise = fetchSummary(session, { id: company.id, name: company.name }, today);
  if (!useCache) return promise;
  if (cache.size >= 4) cache.delete(cache.keys().next().value!);
  const entry = { expires: Infinity, promise };
  cache.set(key, entry);
  try {
    const result = await promise;
    entry.expires = Date.now() + 60000;
    return result;
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  }
}
