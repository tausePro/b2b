import 'server-only';

import { createHash } from 'node:crypto';
import { authenticate, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import { FinancialDataError, readIds, searchAll } from './finanzas.server';
import { buildOpenBalanceReport, overdueDays, type OpenBalanceFilters, type OpenBalanceLine } from './cartera';

type Row = Record<string, unknown>;
export interface OpenBalanceDataset { lines: OpenBalanceLine[]; asOfDate: string; generatedAt: string }
const cache = new Map<string, { expires: number; promise: Promise<OpenBalanceDataset> }>();
const MAX_OPEN_LINES = 25000;
const relationId = (value: unknown): number | null =>
  Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? value[0] : null;
const relationName = (value: unknown): string | null =>
  Array.isArray(value) && typeof value[1] === 'string' && value[1].trim() ? value[1].trim() : null;

export function normalizeOpenBalanceLine(row: Row, document: Row, partner: Row | undefined, today: string): OpenBalanceLine {
  if (row.parent_state !== 'posted' || row.reconciled !== false
    || !['asset_receivable', 'liability_payable'].includes(String(row.account_type))) {
    throw new FinancialDataError('Odoo devolvió una partida fuera de las cuentas abiertas solicitadas.');
  }
  if (relationName(row.company_currency_id) !== 'COP') {
    throw new FinancialDataError('Hay saldos en una moneda de compañía distinta de COP; no se mezclan monedas.', 422);
  }
  const documentId = relationId(row.move_id);
  const companyId = relationId(row.company_id);
  if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || documentId === null || document.id !== documentId
    || companyId === null || relationId(document.company_id) !== companyId || document.state !== 'posted'
    || typeof row.amount_residual !== 'number' || !Number.isFinite(row.amount_residual)) {
    throw new FinancialDataError('No se pudo validar el documento o saldo de una partida contable.');
  }
  const date = typeof row.date === 'string' ? row.date : '';
  const dueDate = row.date_maturity === false ? null : typeof row.date_maturity === 'string' ? row.date_maturity : '';
  try { overdueDays(date, today); overdueDays(dueDate, today); }
  catch { throw new FinancialDataError('Una partida no tiene fechas contables válidas.'); }
  if (date > today) throw new FinancialDataError('Odoo devolvió una partida contabilizada después de hoy.');
  const side = row.account_type === 'asset_receivable' ? 'receivable' : 'payable';
  return {
    id: Number(row.id), side, companyId, companyName: relationName(row.company_id) ?? `Compañía #${companyId}`,
    partnerId: relationId(partner?.commercial_partner_id) ?? relationId(row.partner_id),
    partnerName: relationName(partner?.commercial_partner_id) ?? relationName(row.partner_id) ?? 'Sin tercero identificado',
    documentId, documentName: typeof document.name === 'string' && document.name ? document.name : `Documento #${documentId}`,
    reference: typeof document.ref === 'string' && document.ref ? document.ref : null,
    documentType: String(document.move_type),
    accountName: relationName(row.account_id) ?? 'Cuenta no identificada',
    date, dueDate, daysOverdue: overdueDays(dueDate, today),
    balance: roundCurrency(row.amount_residual * (side === 'payable' ? -1 : 1)),
  };
}

async function fetchOpenBalances(session: OdooSession, today: string): Promise<OpenBalanceDataset> {
  const rows = await searchAll(session, 'account.move.line', [
    ['parent_state', '=', 'posted'], ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']],
    ['reconciled', '=', false], ['amount_residual', '!=', 0], ['date', '<=', today],
  ], ['id', 'move_id', 'partner_id', 'account_id', 'account_type', 'company_id', 'company_currency_id', 'date', 'date_maturity', 'amount_residual', 'parent_state', 'reconciled'], MAX_OPEN_LINES);
  const [documents, partners] = await Promise.all([
    readIds(session, 'account.move', rows.flatMap(row => relationId(row.move_id) === null ? [] : [relationId(row.move_id)!]), ['id', 'name', 'ref', 'move_type', 'state', 'company_id', 'amount_residual_signed']),
    readIds(session, 'res.partner', rows.flatMap(row => relationId(row.partner_id) === null ? [] : [relationId(row.partner_id)!]), ['id', 'commercial_partner_id']),
  ]);
  const documentById = new Map(documents.map(row => [Number(row.id), row]));
  const partnerById = new Map(partners.map(row => [Number(row.id), row]));
  const lines = rows.map(row => {
    const document = documentById.get(relationId(row.move_id) ?? -1);
    if (!document) throw new FinancialDataError('No se pudo leer un documento de cartera.');
    return normalizeOpenBalanceLine(row, document, partnerById.get(relationId(row.partner_id) ?? -1), today);
  });
  const documentBalances = new Map<number, { balance: number; count: number }>();
  for (const line of lines) {
    const summary = documentBalances.get(line.documentId) ?? { balance: 0, count: 0 };
    summary.balance += line.balance * (line.side === 'payable' ? -1 : 1);
    summary.count++;
    documentBalances.set(line.documentId, summary);
  }
  for (const document of documents) {
    if (!['out_invoice', 'out_refund', 'in_invoice', 'in_refund'].includes(String(document.move_type))) continue;
    const summary = documentBalances.get(Number(document.id))!;
    if (typeof document.amount_residual_signed !== 'number' || !Number.isFinite(document.amount_residual_signed)
      || Math.abs(roundCurrency(summary.balance) - document.amount_residual_signed) > Math.max(0.05, summary.count * 0.01)) {
      throw new FinancialDataError('El saldo de un documento no concilia con sus partidas. Puede haber cambiado durante la lectura; actualiza la consulta.');
    }
  }
  return { lines, asOfDate: today, generatedAt: new Date().toISOString() };
}

export async function loadOpenBalanceDataset(useCache = true): Promise<OpenBalanceDataset> {
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const today = getBogotaCalendarDate();
  const key = createHash('sha256').update(JSON.stringify([session.config, session.uid, today])).digest('hex');
  const previous = cache.get(key);
  if (useCache && previous && previous.expires > Date.now()) return previous.promise;
  const promise = fetchOpenBalances(session, today);
  if (!useCache) return promise;
  if (cache.size >= 2) cache.delete(cache.keys().next().value!);
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

export async function getOpenBalanceReport(filters: OpenBalanceFilters) {
  const dataset = await loadOpenBalanceDataset();
  return buildOpenBalanceReport(dataset.lines, dataset.asOfDate, dataset.generatedAt, filters);
}
