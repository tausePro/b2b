import 'server-only';

import { createHash } from 'node:crypto';
import { authenticate, searchCount, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import { FinancialDataError, getOdooReportCompany, readIds, searchAll } from './finanzas.server';
import {
  buildOpenBalanceReport, overdueDays,
  type OpenBalanceCompany, type OpenBalanceFilters, type OpenBalanceLine, type OpenInvoiceDocument, type WrittenOffSummary,
} from './cartera';

type Row = Record<string, unknown>;
export interface OpenBalanceDataset {
  lines: OpenBalanceLine[];
  invoices: OpenInvoiceDocument[];
  writtenOff: WrittenOffSummary;
  asOfDate: string;
  generatedAt: string;
  company: OpenBalanceCompany;
}
export const EXCLUDED_WRITTEN_OFF_MOVES: readonly { id: number; name: string }[] = [{ id: 235543, name: 'I/2025/12/0487' }];
const cache = new Map<string, { expires: number; promise: Promise<OpenBalanceDataset> }>();
const MAX_OPEN_LINES = 25000;
const MAX_OPEN_DOCUMENTS = 25000;
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

async function fetchOpenInvoices(session: OdooSession, company: OpenBalanceCompany): Promise<OpenInvoiceDocument[]> {
  const rows = await searchAll(session, 'account.move', [
    ['company_id', '=', company.id], ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']],
    ['payment_state', 'in', ['not_paid', 'partial']],
  ], ['id', 'move_type', 'journal_id', 'company_id', 'state', 'amount_total_signed', 'amount_residual_signed'], MAX_OPEN_DOCUMENTS,
  undefined, 'Las facturas pendientes superan el límite de lectura; no se muestran totales incompletos.');
  const journalIds = [...new Set(rows.map(row => relationId(row.journal_id)))];
  if (journalIds.some(id => id === null)) throw new FinancialDataError('Una factura pendiente no identifica su diario en Odoo.');
  const creditNoteJournals = new Set<number>();
  for (const journalId of journalIds as number[]) {
    const invoiceCount = await searchCount('account.move', [['journal_id', '=', journalId], ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'in_invoice']]], session);
    if (invoiceCount === 0) creditNoteJournals.add(journalId);
  }
  return rows.map(row => {
    const journalId = relationId(row.journal_id)!;
    if (relationId(row.company_id) !== company.id || row.state !== 'posted'
      || typeof row.amount_total_signed !== 'number' || !Number.isFinite(row.amount_total_signed)
      || typeof row.amount_residual_signed !== 'number' || !Number.isFinite(row.amount_residual_signed)) {
      throw new FinancialDataError('No se pudo validar el importe de una factura pendiente.');
    }
    const side = String(row.move_type).startsWith('out_') ? 'receivable' : 'payable';
    const sign = side === 'payable' ? -1 : 1;
    return {
      id: Number(row.id), side, journalId, journalName: relationName(row.journal_id) ?? `Diario #${journalId}`,
      creditNoteJournal: creditNoteJournals.has(journalId),
      total: roundCurrency(sign * row.amount_total_signed), residual: roundCurrency(sign * row.amount_residual_signed),
    };
  });
}

async function fetchOpenBalances(session: OdooSession, today: string, company: OpenBalanceCompany): Promise<OpenBalanceDataset> {
  const [rows, invoices] = await Promise.all([searchAll(session, 'account.move.line', [
    ['parent_state', '=', 'posted'], ['company_id', '=', company.id], ['account_id.account_type', 'in', ['asset_receivable', 'liability_payable']],
    ['reconciled', '=', false], ['amount_residual', '!=', 0], ['date', '<=', today],
  ], ['id', 'move_id', 'partner_id', 'account_id', 'account_type', 'company_id', 'company_currency_id', 'date', 'date_maturity', 'amount_residual', 'parent_state', 'reconciled'], MAX_OPEN_LINES),
  fetchOpenInvoices(session, company)]);
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
  if (lines.some(line => line.companyId !== company.id)) throw new FinancialDataError('Odoo devolvió partidas de otra compañía. No se mezclan saldos.');
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
  const excluded = new Map(documents.flatMap(document => {
    const rule = EXCLUDED_WRITTEN_OFF_MOVES.find(move => move.id === Number(document.id));
    return rule && document.name === rule.name ? [[rule.id, rule.name] as const] : [];
  }));
  const writtenOffLines = lines.filter(line => excluded.has(line.documentId));
  const writtenOff: WrittenOffSummary = {
    documents: [...new Set(writtenOffLines.map(line => excluded.get(line.documentId)!))],
    lineCount: writtenOffLines.length,
    balance: roundCurrency(writtenOffLines.reduce((total, line) => total + line.balance, 0)),
  };
  return {
    lines: lines.filter(line => !excluded.has(line.documentId)), invoices, writtenOff,
    asOfDate: today, generatedAt: new Date().toISOString(), company,
  };
}

export async function loadOpenBalanceDataset(useCache = true): Promise<OpenBalanceDataset> {
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const today = getBogotaCalendarDate();
  const company = await getOdooReportCompany(session);
  const key = createHash('sha256').update(JSON.stringify([session.config, session.uid, today, company.id])).digest('hex');
  const previous = cache.get(key);
  if (useCache && previous && previous.expires > Date.now()) return previous.promise;
  const promise = fetchOpenBalances(session, today, company);
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
  return buildOpenBalanceReport(dataset.lines, dataset.asOfDate, dataset.generatedAt, filters, dataset.company, {
    invoices: dataset.invoices, writtenOff: dataset.writtenOff,
  });
}
