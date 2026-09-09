import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticate, read, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import {
  buildFinancialReport, calculateRegularCommission, financialMargin, GENERIC_TONER_CATEGORY_ID,
  previousFinancialRange, regularCommissionRate, validateFinancialRange,
  type FinancialAdvisor, type FinancialFilters, type FinancialLine, type FinancialRange,
} from './finanzas';

type Row = Record<string, unknown>;
export interface FinancialDataset { lines: FinancialLine[]; generatedAt: string; warnings: string[]; advisors: FinancialAdvisor[] }
const MAX_INVOICES = 10000;
const MAX_LINES = 100000;
const datasetCache = new Map<string, { expires: number; promise: Promise<FinancialDataset> }>();

export class FinancialDataError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function relationId(value: unknown): number | null {
  return Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? value[0] : null;
}
function relationName(value: unknown): string | null {
  return Array.isArray(value) && typeof value[1] === 'string' && value[1].trim() ? value[1].trim() : null;
}
function ids(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new FinancialDataError('Odoo devolvió vínculos de líneas incompletos.');
  return [...new Set(value as number[])];
}
function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new FinancialDataError(`Odoo no confirmó un valor numérico para ${field}.`);
  return value;
}
function idOf(row: Row): number {
  const id = number(row.id, 'id');
  if (!Number.isSafeInteger(id) || id <= 0) throw new FinancialDataError('Odoo devolvió un identificador inválido.');
  return id;
}

async function searchAll(session: OdooSession, model: string, domain: unknown[], fields: string[], limit: number, context?: Record<string, unknown>): Promise<Row[]> {
  const rows: Row[] = [];
  let lastId = 0;
  for (;;) {
    const page = await searchRead(model, [...domain, ['id', '>', lastId]], fields, { session, limit: 1000, order: 'id asc', context });
    for (const row of page) {
      const id = idOf(row);
      if (id <= lastId) throw new FinancialDataError('La paginación de Odoo no es consistente. Actualiza la consulta.');
      lastId = id;
      rows.push(row);
    }
    if (rows.length > limit) throw new FinancialDataError('El rango devuelve demasiados registros. Reduce las fechas; no se muestran totales parciales.', 422);
    if (page.length < 1000) return rows;
  }
}

async function readIds(session: OdooSession, model: string, values: number[], fields: string[]): Promise<Row[]> {
  const unique = [...new Set(values)];
  const result: Row[] = [];
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const rows = await read(model, batch, fields, session);
    if (rows.length !== batch.length || rows.some((row) => !batch.includes(idOf(row)))) throw new FinancialDataError(`No se pudieron leer todos los registros de ${model}.`);
    result.push(...rows);
  }
  return result;
}

async function portalContext(admin: SupabaseClient) {
  const orderIds = new Set<number>();
  const advisorCandidates = new Map<number, Set<string>>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from('pedidos').select('id, odoo_sale_order_id')
      .not('odoo_sale_order_id', 'is', null).order('id').range(offset, offset + 999);
    if (error) throw new FinancialDataError('No se pudo verificar el origen de los pedidos del portal.');
    for (const row of data ?? []) if (Number.isSafeInteger(row.odoo_sale_order_id) && row.odoo_sale_order_id > 0) orderIds.add(row.odoo_sale_order_id);
    if ((data?.length ?? 0) < 1000) break;
    if (offset >= 100000) throw new FinancialDataError('La vinculación de pedidos excede el límite de consulta.', 422);
  }
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from('usuarios').select('id, odoo_user_id')
      .eq('rol', 'asesor').not('odoo_user_id', 'is', null).order('id').range(offset, offset + 999);
    if (error) throw new FinancialDataError('No se pudo verificar el vínculo de las asesoras con Odoo.');
    for (const row of data ?? []) {
      if (!Number.isSafeInteger(row.odoo_user_id) || row.odoo_user_id <= 0) continue;
      const candidates = advisorCandidates.get(row.odoo_user_id) ?? new Set<string>();
      candidates.add(row.id);
      advisorCandidates.set(row.odoo_user_id, candidates);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return { orderIds, advisorCandidates };
}

export function normalizeFinancialLine(invoice: Row, line: Row, product: Row | undefined, genericCategoryIds: ReadonlySet<number>, portalSaleLineIds: ReadonlySet<number>, portalAdvisorId: string | null): FinancialLine {
  const issues: string[] = [];
  const sign = invoice.move_type === 'out_refund' ? -1 : 1;
  const netSales = roundCurrency(-number(line.balance, 'saldo contable'));
  const quantity = number(line.quantity, 'cantidad');
  const subtotal = number(line.price_subtotal, 'subtotal');
  const headerSubtotal = number(invoice.amount_untaxed, 'base de factura');
  const headerSigned = number(invoice.amount_untaxed_signed, 'base firmada de factura');
  const sameCurrency = relationId(invoice.currency_id) === invoice.companyCurrencyId;
  const conversion = sameCurrency ? 1 : headerSubtotal !== 0 ? headerSigned / (sign * headerSubtotal) : null;
  const purchasePrice = typeof line.purchase_price === 'number' && Number.isFinite(line.purchase_price) ? line.purchase_price : null;
  const recordedMargin = typeof line.margin === 'number' && Number.isFinite(line.margin) ? line.margin : null;
  const signedMargin = typeof line.margin_signed === 'number' && Number.isFinite(line.margin_signed) ? line.margin_signed : null;
  let cost: number | null = null;
  let profit: number | null = null;
  if (purchasePrice === null || purchasePrice <= 0 || (quantity === 0 && netSales !== 0)) {
    issues.push('Costo de factura cero, negativo o no disponible: requiere revisión.');
  } else if (conversion === null || !Number.isFinite(conversion) || conversion <= 0 || recordedMargin === null || signedMargin === null) {
    issues.push('No se puede conciliar el costo y el margen en moneda de compañía.');
  } else {
    const expectedCost = roundCurrency(sign * quantity * purchasePrice * conversion);
    const expectedProfit = roundCurrency(netSales - expectedCost);
    if (Math.abs(subtotal - quantity * purchasePrice - recordedMargin) > 0.05
      || Math.abs(expectedProfit - signedMargin) > 0.05
      || Math.abs(netSales - sign * subtotal * conversion) > 0.05) {
      issues.push('El costo o margen de la línea no concilia con Odoo; utilidad pendiente.');
    } else {
      cost = expectedCost;
      profit = expectedProfit;
    }
  }
  const productId = relationId(line.product_id);
  const categoryId = product ? relationId(product.categ_id) : null;
  const advisorId = relationId(invoice.invoice_user_id);
  const commissionRate = regularCommissionRate(categoryId, genericCategoryIds);
  if (commissionRate === null) issues.push('Producto o categoría no identificable: comisión pendiente de revisión.');
  if (advisorId === null) issues.push('Factura sin vendedor asignado: comisión pendiente de atribución.');
  if (advisorId !== null && portalAdvisorId === null) issues.push('El vendedor Odoo no tiene un vínculo único con una asesora del portal.');
  const saleLineIds = ids(line.sale_line_ids);
  const portalCount = saleLineIds.filter((id) => portalSaleLineIds.has(id)).length;
  const clientId = relationId(invoice.commercial_partner_id) ?? relationId(invoice.partner_id);
  if (clientId === null) issues.push('Cliente no identificable en la factura.');
  return {
    id: idOf(line), invoiceId: idOf(invoice),
    invoiceName: typeof invoice.name === 'string' && invoice.name ? invoice.name : `Documento Odoo #${invoice.id}`,
    invoiceDate: String(invoice.invoice_date), documentType: invoice.move_type as FinancialLine['documentType'],
    companyId: relationId(invoice.company_id)!, companyName: relationName(invoice.company_id) ?? `Compañía Odoo #${relationId(invoice.company_id)}`,
    advisorId, advisorName: relationName(invoice.invoice_user_id) ?? 'Sin vendedor en factura', portalAdvisorId,
    clientId, clientName: relationName(invoice.commercial_partner_id) ?? relationName(invoice.partner_id) ?? 'Cliente no identificado',
    productId, productName: relationName(line.product_id) ?? (typeof line.name === 'string' && line.name ? line.name : 'Línea sin producto'),
    sku: typeof product?.default_code === 'string' && product.default_code ? product.default_code : null,
    categoryId, categoryName: product ? relationName(product.categ_id) : null,
    unitId: relationId(line.product_uom_id), unitName: relationName(line.product_uom_id) ?? 'Sin unidad',
    quantity: sign * quantity, netSales, cost, profit, marginPercent: financialMargin(profit, netSales),
    commissionRate, commission: advisorId === null ? null : calculateRegularCommission(netSales, commissionRate),
    channel: portalCount ? portalCount === saleLineIds.length ? 'portal' : 'mixed' : 'other', issues,
  };
}

async function fetchDataset(admin: SupabaseClient, session: OdooSession, range: FinancialRange): Promise<FinancialDataset> {
  const previous = previousFinancialRange(range);
  const warnings = [
    'Comisión habitual calculada, no liquidada: 1% general y 2% en la categoría Odoo 26 y sus descendientes. No registra pagos ni modifica liquidaciones.',
    'La clasificación de producto y el vendedor son los registrados actualmente en Odoo. Las consultas históricas no sustituyen liquidaciones anteriores.',
    'Utilidad bruta comercial según costo de factura; no es utilidad neta después de gastos. Costos cero o inconsistentes se señalan para revisión.',
    'Otros/sin vínculo identifica líneas sin vínculo verificable a pedidos del portal; no presume su canal comercial.',
  ];
  const [invoices, categories, portal] = await Promise.all([
    searchAll(session, 'account.move', [
      ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['invoice_date', '>=', previous.from], ['invoice_date', '<=', range.to],
    ], ['id', 'name', 'move_type', 'invoice_date', 'invoice_user_id', 'commercial_partner_id', 'partner_id', 'company_id', 'currency_id', 'amount_untaxed', 'amount_untaxed_signed', 'margin_signed', 'cost_total'], MAX_INVOICES),
    searchAll(session, 'product.category', [], ['id', 'name', 'parent_id'], 10000),
    portalContext(admin),
  ]);
  if (!categories.some((row) => row.id === GENERIC_TONER_CATEGORY_ID)) throw new FinancialDataError('No se encontró la categoría 26 de tóner genéricos. No se puede confirmar la regla del 2%.', 422);
  const genericCategoryIds = new Set([GENERIC_TONER_CATEGORY_ID]);
  for (let changed = true; changed;) {
    changed = false;
    for (const category of categories) {
      if (genericCategoryIds.has(relationId(category.parent_id) ?? -1) && !genericCategoryIds.has(idOf(category))) {
        genericCategoryIds.add(idOf(category));
        changed = true;
      }
    }
  }
  const advisorDirectory = new Map<number, FinancialAdvisor>();
  const portalUsers = portal.advisorCandidates.size ? await searchAll(session, 'res.users', [['id', 'in', [...portal.advisorCandidates.keys()]]], ['id', 'name'], 10000, { active_test: false }) : [];
  for (const user of portalUsers) {
    const candidates = portal.advisorCandidates.get(idOf(user));
    if (typeof user.name === 'string' && user.name.trim()) advisorDirectory.set(idOf(user), {
      id: idOf(user), name: user.name.trim(), portalAdvisorId: candidates?.size === 1 ? [...candidates][0] : null,
    });
  }
  for (const invoice of invoices) {
    if (!['out_invoice', 'out_refund'].includes(String(invoice.move_type)) || typeof invoice.invoice_date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.invoice_date) || invoice.invoice_date < previous.from || invoice.invoice_date > range.to) {
      throw new FinancialDataError('Odoo devolvió un documento fuera del tipo o rango solicitado.');
    }
    const id = relationId(invoice.invoice_user_id);
    const name = relationName(invoice.invoice_user_id);
    if (id !== null && name) {
      const candidates = portal.advisorCandidates.get(id);
      advisorDirectory.set(id, { id, name, portalAdvisorId: candidates?.size === 1 ? [...candidates][0] : null });
    }
  }
  const advisors = [...advisorDirectory.values()];
  if (!invoices.length) return { lines: [], generatedAt: new Date().toISOString(), warnings, advisors };
  const companyIds = invoices.map((invoice) => {
    const id = relationId(invoice.company_id);
    if (id === null) throw new FinancialDataError('Una factura no identifica su compañía Odoo.');
    return id;
  });
  const companies = await readIds(session, 'res.company', companyIds, ['id', 'currency_id']);
  const companyCurrency = new Map(companies.map((company) => [idOf(company), relationId(company.currency_id)]));
  if (companies.some((company) => relationName(company.currency_id) !== 'COP')) {
    throw new FinancialDataError('Hay compañías cuya moneda no es COP. No se mezclan monedas en los totales.', 422);
  }
  const invoiceById = new Map<number, Row>(invoices.map((invoice) => [idOf(invoice), { ...invoice, companyCurrencyId: companyCurrency.get(relationId(invoice.company_id)!) }]));
  const rawLines = await searchAll(session, 'account.move.line', [
    ['move_id', 'in', invoices.map(idOf)], ['display_type', '=', 'product'], ['tax_line_id', '=', false],
  ], ['id', 'move_id', 'name', 'product_id', 'product_uom_id', 'quantity', 'balance', 'price_subtotal', 'purchase_price', 'margin', 'margin_signed', 'sale_line_ids'], MAX_LINES);
  const productIds = rawLines.map((line) => relationId(line.product_id)).filter((id): id is number => id !== null);
  const referencedSaleLines = [...new Set(rawLines.flatMap((line) => ids(line.sale_line_ids)))];
  const [products, portalSaleLines] = await Promise.all([
    readIds(session, 'product.product', productIds, ['id', 'default_code', 'categ_id']),
    portal.orderIds.size && referencedSaleLines.length ? searchAll(session, 'sale.order.line', [
      ['id', 'in', referencedSaleLines], ['order_id', 'in', [...portal.orderIds]],
    ], ['id'], MAX_LINES) : Promise.resolve([]),
  ]);
  const productById = new Map(products.map((product) => [idOf(product), product]));
  const portalLineIds = new Set(portalSaleLines.map(idOf));
  const grouped = new Map<number, FinancialLine[]>();
  const lines = rawLines.map((line) => {
    const invoice = invoiceById.get(relationId(line.move_id) ?? -1);
    if (!invoice) throw new FinancialDataError('Una línea no pertenece a las facturas consultadas.');
    const candidates = portal.advisorCandidates.get(relationId(invoice.invoice_user_id) ?? -1);
    const portalAdvisorId = candidates?.size === 1 ? [...candidates][0] : null;
    const normalized = normalizeFinancialLine(invoice, line, productById.get(relationId(line.product_id) ?? -1), genericCategoryIds, portalLineIds, portalAdvisorId);
    const rows = grouped.get(normalized.invoiceId) ?? [];
    rows.push(normalized);
    grouped.set(normalized.invoiceId, rows);
    return normalized;
  });
  let invalidCostInvoices = 0;
  let emptyInvoices = 0;
  for (const invoice of invoices) {
    const rows = grouped.get(idOf(invoice)) ?? [];
    const base = number(invoice.amount_untaxed_signed, 'base de factura');
    const summedBase = roundCurrency(rows.reduce((total, line) => total + line.netSales, 0));
    const tolerance = Math.max(0.05, rows.length * 0.01);
    if (Math.abs(summedBase - base) > tolerance) throw new FinancialDataError(`La factura ${invoice.name} no concilia con sus líneas. No se muestran totales parciales.`, 422);
    if (!rows.length) { emptyInvoices++; continue; }
    if (rows.every((line) => line.cost !== null)) {
      const totalCost = roundCurrency(rows.reduce((total, line) => total + line.cost!, 0));
      const totalProfit = roundCurrency(rows.reduce((total, line) => total + line.profit!, 0));
      if (typeof invoice.cost_total !== 'number' || !Number.isFinite(invoice.cost_total)
        || typeof invoice.margin_signed !== 'number' || !Number.isFinite(invoice.margin_signed)
        || Math.abs(totalCost - invoice.cost_total) > tolerance || Math.abs(totalProfit - invoice.margin_signed) > tolerance) {
        invalidCostInvoices++;
        for (const line of rows) {
          line.cost = null;
          line.profit = null;
          line.marginPercent = null;
          line.issues.push('Los costos de las líneas no concilian con la cabecera de factura.');
        }
      }
    }
  }
  if (invalidCostInvoices) warnings.push(`${invalidCostInvoices} documentos tienen diferencias de costo entre cabecera y líneas.`);
  if (emptyInvoices) warnings.push(`${emptyInvoices} documentos de base cero sin líneas de producto no generan métricas de documentos/clientes.`);
  return { lines, generatedAt: new Date().toISOString(), warnings, advisors };
}

export async function loadFinancialDataset(admin: SupabaseClient, range: FinancialRange, useCache = true): Promise<FinancialDataset> {
  validateFinancialRange(range.from, range.to);
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const key = createHash('sha256').update(JSON.stringify([session.config, session.uid, range.from, range.to])).digest('hex');
  const cached = datasetCache.get(key);
  if (useCache && cached && cached.expires > Date.now()) return cached.promise;
  const promise = fetchDataset(admin, session, range);
  if (!useCache) return promise;
  if (datasetCache.size >= 2) datasetCache.delete(datasetCache.keys().next().value!);
  const entry = { expires: Infinity, promise };
  datasetCache.set(key, entry);
  try {
    const result = await promise;
    entry.expires = Date.now() + 60000;
    return result;
  } catch (error) {
    if (datasetCache.get(key) === entry) datasetCache.delete(key);
    throw error;
  }
}

export async function getFinancialReport(admin: SupabaseClient, range: FinancialRange, filters: FinancialFilters, useCache = true) {
  const dataset = await loadFinancialDataset(admin, range, useCache);
  const report = buildFinancialReport(dataset.lines, range, filters, dataset.generatedAt, dataset.warnings);
  report.selectedAdvisor = filters.advisorId === undefined || filters.advisorId === null ? null : dataset.advisors.find((advisor) => advisor.id === filters.advisorId) ?? null;
  if (filters.advisorId === undefined && filters.clientId === undefined && filters.productId === undefined && filters.invoiceId === undefined) {
    const present = new Set(report.advisors.map((advisor) => advisor.id));
    const empty = buildFinancialReport([], range, { page: 1 }, dataset.generatedAt).totals;
    report.advisors.push(...dataset.advisors.filter((advisor) => advisor.portalAdvisorId && !present.has(advisor.id))
      .map((advisor) => ({ ...empty, ...advisor, key: String(advisor.id) })));
    report.advisors.sort((a, b) => b.netSales - a.netSales || a.name.localeCompare(b.name, 'es'));
  }
  return report;
}
