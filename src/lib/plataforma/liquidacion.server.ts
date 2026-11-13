import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticate, read, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { getInvoiceLineBase, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import {
  bogotaMonth, liquidateClient, monthRange, summarizeLiquidation, type LiquidationClient, type LiquidationInvoice, type LiquidationSummary,
} from './liquidacion';

export interface PlatformLiquidationReport {
  month: string;
  range: { from: string; to: string };
  preliminary: boolean;
  generatedAt: string;
  clients: LiquidationClient[];
  summary: LiquidationSummary;
  warnings: string[];
}

type OrderRow = { id: string; empresa_id: string; odoo_sale_order_id: number | null; fecha_creacion: string; estado: string; fecha_aprobacion: string | null };
type OdooRow = Record<string, unknown>;

const relationId = (value: unknown) => (Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? Number(value[0]) : null);
const relationName = (value: unknown) => (Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null);
const numericIds = (value: unknown): number[] => (Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : []);

async function readChunks(session: OdooSession, model: string, ids: number[], fields: string[]): Promise<OdooRow[]> {
  const rows: OdooRow[] = [];
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += 100) rows.push(...await read(model, unique.slice(index, index + 100), fields, session));
  return rows;
}

async function searchAll(session: OdooSession, model: string, domain: unknown[], fields: string[]): Promise<OdooRow[]> {
  const rows: OdooRow[] = [];
  for (let lastId = 0; ;) {
    const page = await searchRead(model, [...domain, ['id', '>', lastId]], fields, { session, limit: 500, order: 'id asc' });
    rows.push(...page);
    if (page.length < 500) return rows;
    lastId = Number(page[page.length - 1].id);
  }
}

/**
 * Liquidación del mes: clientes de la plataforma, pedidos aprobados del mes y neto facturado en Odoo
 * (líneas de factura vinculadas a líneas de pedidos del portal, menos notas crédito). Solo lectura en Odoo.
 */
export async function getPlatformLiquidation(admin: SupabaseClient, month: string, today: string): Promise<PlatformLiquidationReport> {
  const range = monthRange(month);
  const orders: OrderRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from('pedidos').select('id, empresa_id, odoo_sale_order_id, fecha_creacion, estado, fecha_aprobacion').order('id').range(offset, offset + 999);
    if (error) throw new Error('No se pudieron leer los pedidos de la plataforma.');
    orders.push(...((data ?? []) as OrderRow[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  // Pedido de plataforma: enviado y aprobado (por el cliente o automático), no rechazado.
  const valid = orders.filter((order) => order.fecha_aprobacion && !['rechazado', 'borrador', 'en_aprobacion'].includes(order.estado));
  const warnings: string[] = [];
  const pendingApproval = orders.filter((order) => order.estado === 'en_aprobacion' && bogotaMonth(order.fecha_creacion) === month).length;
  if (pendingApproval) warnings.push(`${pendingApproval} ${pendingApproval === 1 ? 'pedido del mes sigue' : 'pedidos del mes siguen'} en aprobación; cuentan cuando se aprueben.`);

  const byCompany = new Map<string, { months: Set<string>; inMonth: number }>();
  for (const order of valid) {
    const orderMonth = bogotaMonth(order.fecha_creacion);
    const entry = byCompany.get(order.empresa_id) ?? { months: new Set<string>(), inMonth: 0 };
    entry.months.add(orderMonth);
    if (orderMonth === month) entry.inMonth++;
    byCompany.set(order.empresa_id, entry);
  }
  const companyIds = [...byCompany.keys()];
  const names = new Map<string, string>();
  if (companyIds.length) {
    const { data, error } = await admin.from('empresas').select('id, nombre').in('id', companyIds);
    if (error) throw new Error('No se pudieron leer las empresas de la plataforma.');
    for (const company of data ?? []) names.set(company.id, company.nombre);
  }

  const netByCompany = new Map<string, number>();
  const invoicesByCompany = new Map<string, Map<number, LiquidationInvoice>>();
  const companyBySale = new Map<number, string>();
  for (const order of valid) if (order.odoo_sale_order_id) companyBySale.set(Number(order.odoo_sale_order_id), order.empresa_id);
  if (companyBySale.size) {
    const config = await getServerOdooConfig();
    if (!config) throw new Error('No hay configuración Odoo disponible para la liquidación.');
    const session = await authenticate(config);
    const sales = await readChunks(session, 'sale.order', [...companyBySale.keys()], ['id', 'order_line', 'invoice_ids', 'date_order']);
    const companyBySaleLine = new Map<number, string>();
    const invoiceIds = new Set<number>();
    let withoutInvoice = 0;
    for (const sale of sales) {
      const companyId = companyBySale.get(Number(sale.id))!;
      for (const lineId of numericIds(sale.order_line)) companyBySaleLine.set(lineId, companyId);
      const ids = numericIds(sale.invoice_ids);
      ids.forEach((id) => invoiceIds.add(id));
      if (!ids.length && typeof sale.date_order === 'string' && sale.date_order.slice(0, 7) === month) withoutInvoice++;
    }
    if (withoutInvoice) warnings.push(`${withoutInvoice} ${withoutInvoice === 1 ? 'pedido del mes aún no tiene' : 'pedidos del mes aún no tienen'} factura publicada; su valor cuenta en el mes en que se facture.`);

    const fields = ['id', 'name', 'state', 'move_type', 'invoice_date', 'company_currency_id'];
    const documents = await readChunks(session, 'account.move', [...invoiceIds], fields);
    const originals = documents.filter((document) => document.move_type === 'out_invoice').map((document) => Number(document.id));
    for (let index = 0; index < originals.length; index += 100) {
      documents.push(...await searchAll(session, 'account.move', [
        ['reversed_entry_id', 'in', originals.slice(index, index + 100)], ['move_type', '=', 'out_refund'], ['state', '=', 'posted'],
        ['invoice_date', '>=', range.from], ['invoice_date', '<=', range.to],
      ], fields));
    }
    const current = new Map<number, OdooRow>();
    for (const document of documents) {
      if (document.state === 'posted' && ['out_invoice', 'out_refund'].includes(String(document.move_type))
        && typeof document.invoice_date === 'string' && document.invoice_date >= range.from && document.invoice_date <= range.to) current.set(Number(document.id), document);
    }
    const ids = [...current.keys()];
    for (let index = 0; index < ids.length; index += 100) {
      const lines = await searchAll(session, 'account.move.line', [['move_id', 'in', ids.slice(index, index + 100)], ['display_type', '=', 'product']], ['id', 'move_id', 'sale_line_ids', 'balance', 'tax_line_id']);
      for (const line of lines) {
        const documentId = relationId(line.move_id);
        const document = documentId ? current.get(documentId) : undefined;
        if (!document || !documentId || relationId(line.tax_line_id)) continue;
        const saleLineIds = numericIds(line.sale_line_ids);
        const linked = [...new Set(saleLineIds.map((id) => companyBySaleLine.get(id)).filter((id): id is string => Boolean(id)))];
        if (!linked.length) continue;
        if (linked.length > 1 || saleLineIds.some((id) => !companyBySaleLine.has(id))) {
          warnings.push(`${String(document.name)}: una línea mezcla pedidos de distintos orígenes; no se incluyó.`);
          continue;
        }
        if (relationName(document.company_currency_id) !== 'COP') {
          warnings.push(`${String(document.name)}: moneda distinta de COP; no se incluyó.`);
          continue;
        }
        const [companyId] = linked;
        const base = getInvoiceLineBase(line.balance);
        netByCompany.set(companyId, roundCurrency((netByCompany.get(companyId) ?? 0) + base));
        const invoices = invoicesByCompany.get(companyId) ?? new Map<number, LiquidationInvoice>();
        const invoice = invoices.get(documentId) ?? { name: String(document.name), date: String(document.invoice_date), net: 0 };
        invoice.net = roundCurrency(invoice.net + base);
        invoices.set(documentId, invoice);
        invoicesByCompany.set(companyId, invoices);
      }
    }
  }

  const clients = companyIds
    .map((companyId) => {
      const entry = byCompany.get(companyId)!;
      return liquidateClient({
        companyId, name: names.get(companyId) ?? 'Empresa sin nombre', activationMonth: [...entry.months].sort()[0], orderMonths: [...entry.months],
        ordersInMonth: entry.inMonth, netInvoiced: netByCompany.get(companyId) ?? 0,
        invoices: [...(invoicesByCompany.get(companyId)?.values() ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
      }, month);
    })
    .filter((client): client is LiquidationClient => client !== null)
    .sort((a, b) => b.fee - a.fee || b.netInvoiced - a.netInvoiced || a.name.localeCompare(b.name, 'es'));
  for (const client of clients) if (client.netInvoiced < 0) warnings.push(`${client.name}: las notas crédito del mes superan lo facturado; revisar en Odoo.`);
  return { month, range, preliminary: month >= today.slice(0, 7), generatedAt: new Date().toISOString(), clients, summary: summarizeLiquidation(clients), warnings: [...new Set(warnings)] };
}
