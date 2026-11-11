import 'server-only';

import { authenticate, readGroup, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { FinancialDataError, getOdooReportCompany, readIds, searchAll } from './finanzas.server';
import {
  summarizeCustomerProducts,
  type CustomerInvoiceLine, type CustomerProductInfo, type CustomerProductsReport, type CustomerSearchResult,
} from './productosCliente';

type Row = Record<string, unknown>;
const MAX_LINES = 20000;
const relationId = (value: unknown) => (Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? value[0] as number : null);
const relationName = (value: unknown) => (Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

async function openSession(): Promise<{ session: OdooSession; company: { id: number; name: string } }> {
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const company = await getOdooReportCompany(session);
  return { session, company: { id: company.id, name: company.name } };
}

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const search = query.trim().slice(0, 80);
  if (search.length < 2) throw new FinancialDataError('Escribe al menos 2 caracteres del nombre o NIT.', 400);
  const { session, company } = await openSession();
  const partners = await searchRead('res.partner', [
    ['customer_rank', '>', 0], ['parent_id', '=', false], '|', '|', ['name', 'ilike', search], ['vat', 'ilike', search], ['ref', 'ilike', search],
  ], ['id', 'name', 'vat', 'property_product_pricelist'], { limit: 20, order: 'name asc', session }) as Row[];
  const ids = partners.map(row => Number(row.id));
  const last = ids.length ? await readGroup('account.move', [
    ['company_id', '=', company.id], ['state', '=', 'posted'], ['move_type', '=', 'out_invoice'], ['commercial_partner_id', 'in', ids],
  ], ['invoice_date:max'], ['commercial_partner_id'], { session }) : [];
  const lastById = new Map(last.map(group => [relationId(group.commercial_partner_id), typeof group.invoice_date === 'string' ? group.invoice_date : null]));
  return partners.map(row => ({
    id: Number(row.id), name: String(row.name ?? ''), vat: typeof row.vat === 'string' && row.vat ? row.vat : null,
    pricelistName: relationName(row.property_product_pricelist), lastInvoiceDate: lastById.get(Number(row.id)) ?? null,
  })).sort((a, b) => (b.lastInvoiceDate ?? '').localeCompare(a.lastInvoiceDate ?? '') || a.name.localeCompare(b.name, 'es'));
}

export async function getCustomerProducts(customerId: number, range: { from: string; to: string }): Promise<CustomerProductsReport> {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new FinancialDataError('Cliente no válido.', 400);
  if (!isDate(range.from) || !isDate(range.to) || range.from > range.to
    || (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000 > 731) {
    throw new FinancialDataError('Revisa el período: fechas válidas y máximo dos años.', 400);
  }
  const { session, company } = await openSession();
  const [partner] = await readIds(session, 'res.partner', [customerId], ['id', 'name', 'vat', 'property_product_pricelist']).catch((error: unknown) => {
    throw error instanceof FinancialDataError ? new FinancialDataError('El cliente no existe en Odoo.', 404) : error;
  });
  const rows = await searchAll(session, 'account.move.line', [
    ['company_id', '=', company.id], ['parent_state', '=', 'posted'], ['move_id.move_type', 'in', ['out_invoice', 'out_refund']],
    ['move_id.commercial_partner_id', '=', customerId], ['display_type', '=', 'product'], ['product_id', '!=', false],
    ['move_id.invoice_date', '>=', range.from], ['move_id.invoice_date', '<=', range.to],
  ], ['id', 'move_id', 'product_id', 'quantity', 'product_uom_id'], MAX_LINES, undefined, 'El cliente tiene demasiadas líneas en el período; acota las fechas.');
  const [moves, products] = await Promise.all([
    readIds(session, 'account.move', rows.flatMap(row => relationId(row.move_id) ?? []), ['id', 'invoice_date', 'move_type', 'company_id', 'state']),
    readIds(session, 'product.product', rows.flatMap(row => relationId(row.product_id) ?? []), ['id', 'display_name', 'default_code', 'uom_id']),
  ]);
  const moveById = new Map(moves.map(row => [Number(row.id), row]));
  const productById = new Map<number, CustomerProductInfo>(products.map(row => [Number(row.id), {
    id: Number(row.id), sku: typeof row.default_code === 'string' && row.default_code ? row.default_code : null,
    name: String(row.display_name ?? '').replace(/^\[[^\]]*\]\s*/, ''), unitName: relationName(row.uom_id) ?? 'Unidad',
  }]));
  const lines: CustomerInvoiceLine[] = rows.map(row => {
    const move = moveById.get(relationId(row.move_id) ?? -1);
    const productId = relationId(row.product_id);
    if (!move || productId === null || relationId(move.company_id) !== company.id || move.state !== 'posted' || typeof move.invoice_date !== 'string') {
      throw new FinancialDataError('No se pudo validar una factura del cliente.');
    }
    return {
      id: Number(row.id), moveId: Number(move.id), documentType: move.move_type === 'out_refund' ? 'out_refund' : 'out_invoice',
      invoiceDate: move.invoice_date, productId, quantity: Number(row.quantity),
      unitName: relationName(row.product_uom_id) ?? productById.get(productId)?.unitName ?? 'Unidad',
    };
  });
  return {
    company, customer: { id: Number(partner.id), name: String(partner.name ?? ''), vat: typeof partner.vat === 'string' && partner.vat ? partner.vat : null, pricelistName: relationName(partner.property_product_pricelist) },
    range, generatedAt: new Date().toISOString(),
    invoiceCount: new Set(lines.filter(line => line.documentType === 'out_invoice').map(line => line.moveId)).size,
    products: summarizeCustomerProducts(lines, productById),
    warnings: [
      `Facturas publicadas de ${company.name} al cliente (y sus contactos), por fecha de factura. Las notas crédito restan cantidad.`,
      'Los archivos no incluyen precios: "Precio nuevo" y "fixed_price" quedan vacíos para llenarlos antes de crear la tarifa.',
    ],
  };
}
