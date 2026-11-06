import 'server-only';

import { authenticate, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import { FinancialDataError, getOdooReportCompany, readIds, searchAll } from '@/lib/gerencia/finanzas.server';
import {
  normalizePurchaseLine, odooDateTimeToBogotaDate, purchaseHistoryRange, summarizePurchaseHistory, PURCHASE_SEARCH_LIMIT,
  type PurchaseCompany, type PurchaseHistoryLine, type PurchaseHistoryRange, type PurchaseHistoryReport, type PurchaseProduct,
  type PurchaseSearchReport, type PurchaseUom, type RawPurchaseOrder,
} from './historial';

type Row = Record<string, unknown>;
const MAX_PURCHASE_LINES = 20000;
const PRODUCT_FIELDS = ['id', 'display_name', 'default_code', 'uom_id'];

const relationId = (value: unknown) => (Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? value[0] as number : null);
const relationName = (value: unknown) => (Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null);

function nextDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function openSession(): Promise<{ session: OdooSession; company: PurchaseCompany; currencyId: number; range: PurchaseHistoryRange }> {
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const company = await getOdooReportCompany(session);
  const [companyRow] = await readIds(session, 'res.company', [company.id], ['id', 'currency_id']);
  const currencyId = relationId(companyRow?.currency_id);
  if (!currencyId) throw new FinancialDataError('No se pudo leer la moneda de la compañía en Odoo.');
  return { session, company: { id: company.id, name: company.name }, currencyId, range: purchaseHistoryRange(getBogotaCalendarDate()) };
}

function toProduct(row: Row, uomById: Map<number, PurchaseUom>): PurchaseProduct {
  const uomId = relationId(row.uom_id);
  return {
    id: Number(row.id), name: String(row.display_name ?? ''), sku: typeof row.default_code === 'string' && row.default_code ? row.default_code : null,
    unitName: (uomId !== null ? uomById.get(uomId)?.name : undefined) ?? relationName(row.uom_id) ?? 'Unidad',
  };
}

async function loadPurchaseLines(session: OdooSession, companyId: number, currencyId: number, range: PurchaseHistoryRange, products: Row[]) {
  const productIds = products.map(row => Number(row.id));
  const rows = productIds.length ? await searchAll(session, 'purchase.order.line', [
    ['company_id', '=', companyId], ['state', 'in', ['purchase', 'done']], ['display_type', '=', false], ['product_id', 'in', productIds],
    ['order_id.date_order', '>=', `${range.from} 05:00:00`], ['order_id.date_order', '<', `${nextDay(range.to)} 05:00:00`],
  ], ['id', 'order_id', 'product_id', 'product_qty', 'price_subtotal', 'product_uom', 'company_id', 'state'], MAX_PURCHASE_LINES,
  undefined, 'El historial de compras supera el límite de lectura; no se muestran costos incompletos.') : [];
  const orderIds = [...new Set(rows.flatMap(row => relationId(row.order_id) ?? []))];
  const uomIds = [...new Set([...rows.flatMap(row => relationId(row.product_uom) ?? []), ...products.flatMap(row => relationId(row.uom_id) ?? [])])];
  const [orders, uoms] = await Promise.all([
    readIds(session, 'purchase.order', orderIds, ['id', 'name', 'partner_id', 'currency_id', 'currency_rate', 'date_order', 'company_id', 'state']),
    readIds(session, 'uom.uom', uomIds, ['id', 'name', 'factor', 'category_id']),
  ]);
  const uomById = new Map<number, PurchaseUom>(uoms.map(row => [Number(row.id), {
    id: Number(row.id), name: String(row.name ?? ''), factor: Number(row.factor), categoryId: relationId(row.category_id),
  }]));
  const orderById = new Map<number, RawPurchaseOrder>(orders.map(row => {
    if (relationId(row.company_id) !== companyId || !['purchase', 'done'].includes(String(row.state))) {
      throw new FinancialDataError('Odoo devolvió una orden de compra de otra compañía o sin confirmar.');
    }
    return [Number(row.id), {
      id: Number(row.id), name: String(row.name ?? ''), supplierId: relationId(row.partner_id), supplierName: relationName(row.partner_id) ?? 'Proveedor sin nombre',
      currencyId: relationId(row.currency_id), currencyRate: row.currency_rate, date: odooDateTimeToBogotaDate(row.date_order),
    }];
  }));
  const productUomById = new Map(products.map(row => [Number(row.id), uomById.get(relationId(row.uom_id) ?? -1) ?? null]));
  const linesByProduct = new Map<number, PurchaseHistoryLine[]>(productIds.map(id => [id, []]));
  const issues = new Map<string, number>();
  for (const row of rows) {
    const order = orderById.get(relationId(row.order_id) ?? -1);
    const productId = relationId(row.product_id);
    if (!order || productId === null || !linesByProduct.has(productId)) throw new FinancialDataError('No se pudo relacionar una línea de compra con su orden o producto.');
    const result = normalizePurchaseLine({
      id: Number(row.id), orderId: order.id, quantity: row.product_qty, subtotal: row.price_subtotal,
      lineUom: uomById.get(relationId(row.product_uom) ?? -1) ?? null, productUom: productUomById.get(productId) ?? null,
    }, order, currencyId);
    if ('issue' in result) issues.set(result.issue, (issues.get(result.issue) ?? 0) + 1);
    else linesByProduct.get(productId)!.push(result.line);
  }
  const warnings = [...issues].map(([issue, count]) => `${count} línea(s) excluida(s): ${issue}`);
  return { linesByProduct, uomById, warnings };
}

const BASE_WARNINGS = (company: PurchaseCompany) => [
  `Órdenes de compra confirmadas de ${company.name} (por fecha de la orden). Costos en COP sin IVA por unidad del producto, con descuentos aplicados.`,
];

export async function searchPurchaseProducts(query: string): Promise<PurchaseSearchReport> {
  const search = query.trim().slice(0, 80);
  if (search.length < 2) throw new FinancialDataError('Escribe al menos 2 caracteres del nombre o la referencia.', 400);
  const { session, company, currencyId, range } = await openSession();
  const products = await searchRead('product.product', ['|', ['name', 'ilike', search], ['default_code', 'ilike', search]], PRODUCT_FIELDS, {
    limit: PURCHASE_SEARCH_LIMIT, order: 'default_code, id', session,
  }) as Row[];
  const { linesByProduct, uomById, warnings } = await loadPurchaseLines(session, company.id, currencyId, range, products);
  const summaries = products.map(row => ({ ...toProduct(row, uomById), summary: summarizePurchaseHistory(linesByProduct.get(Number(row.id)) ?? []) }))
    .sort((a, b) => Number(b.summary.purchaseCount > 0) - Number(a.summary.purchaseCount > 0) || a.name.localeCompare(b.name, 'es'));
  return {
    currency: 'COP', company, range, generatedAt: new Date().toISOString(), products: summaries,
    warnings: [...BASE_WARNINGS(company), ...(products.length === PURCHASE_SEARCH_LIMIT ? [`Se muestran los primeros ${PURCHASE_SEARCH_LIMIT} productos; precisa la búsqueda si no aparece el que buscas.`] : []), ...warnings],
  };
}

export async function getProductPurchaseHistory(productId: number): Promise<PurchaseHistoryReport> {
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new FinancialDataError('Producto no válido.', 400);
  const { session, company, currencyId, range } = await openSession();
  const products = await readIds(session, 'product.product', [productId], PRODUCT_FIELDS).catch((error: unknown) => {
    throw error instanceof FinancialDataError ? new FinancialDataError('El producto no existe o no está disponible en Odoo.', 404) : error;
  });
  const { linesByProduct, uomById, warnings } = await loadPurchaseLines(session, company.id, currencyId, range, products);
  const lines = [...(linesByProduct.get(productId) ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return {
    currency: 'COP', company, range, generatedAt: new Date().toISOString(), product: toProduct(products[0], uomById),
    summary: summarizePurchaseHistory(lines), lines, warnings: [...BASE_WARNINGS(company), ...warnings],
  };
}
