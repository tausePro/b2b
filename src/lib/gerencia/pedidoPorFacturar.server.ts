import 'server-only';

import { authenticate, read, searchCount, searchRead } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import { FinancialDataError, getOdooReportCompany } from './finanzas.server';

export interface OrderToInvoiceLine {
  id: number; product: string; ordered: number; delivered: number; invoiced: number; toInvoice: number; amountToInvoice: number;
}
export interface OrderToInvoiceDetail {
  id: number; name: string; partnerName: string; advisorName: string | null; date: string | null; clientRef: string | null;
  amountUntaxed: number; amountToInvoice: number; pendingDeliveries: number;
  draftInvoices: { name: string; amount: number }[]; lines: OrderToInvoiceLine[];
}

const relationName = (value: unknown) => (Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null);
const relationId = (value: unknown) => (Array.isArray(value) && Number.isSafeInteger(value[0]) ? Number(value[0]) : null);
const numberValue = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const ids = (value: unknown): number[] => (Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : []);

/** Detalle de un pedido de venta con saldo por facturar: líneas, entregas pendientes y facturas en borrador. Solo lectura. */
export async function loadOrderToInvoiceDetail(orderId: number): Promise<OrderToInvoiceDetail> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) throw new FinancialDataError('Pedido inválido.', 400);
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const company = await getOdooReportCompany(session);
  const [order] = await read('sale.order', [orderId], ['id', 'name', 'partner_id', 'user_id', 'date_order', 'client_order_ref', 'amount_untaxed', 'company_id', 'invoice_ids', 'picking_ids'], session);
  if (!order || relationId(order.company_id) !== company.id) throw new FinancialDataError('El pedido no existe en la compañía consultada.', 404);
  const [lines, pendingDeliveries, invoices] = await Promise.all([
    searchRead('sale.order.line', [['order_id', '=', orderId], ['display_type', '=', false]],
      ['id', 'product_id', 'name', 'product_uom_qty', 'qty_delivered', 'qty_invoiced', 'qty_to_invoice', 'untaxed_amount_to_invoice'], { session, limit: 500, order: 'sequence asc, id asc' }),
    ids(order.picking_ids).length ? searchCount('stock.picking', [['id', 'in', ids(order.picking_ids)], ['state', 'not in', ['done', 'cancel']]], session) : Promise.resolve(0),
    ids(order.invoice_ids).length ? read('account.move', ids(order.invoice_ids), ['name', 'state', 'amount_untaxed_signed'], session) : Promise.resolve([]),
  ]);
  const detailLines = lines.map((line) => ({
    id: Number(line.id), product: relationName(line.product_id) ?? String(line.name ?? 'Producto'),
    ordered: numberValue(line.product_uom_qty), delivered: numberValue(line.qty_delivered), invoiced: numberValue(line.qty_invoiced),
    toInvoice: numberValue(line.qty_to_invoice), amountToInvoice: roundCurrency(numberValue(line.untaxed_amount_to_invoice)),
  }));
  return {
    id: orderId, name: String(order.name), partnerName: relationName(order.partner_id) ?? 'Cliente', advisorName: relationName(order.user_id),
    date: typeof order.date_order === 'string' ? order.date_order.slice(0, 10) : null, clientRef: typeof order.client_order_ref === 'string' ? order.client_order_ref : null,
    amountUntaxed: roundCurrency(numberValue(order.amount_untaxed)),
    amountToInvoice: roundCurrency(detailLines.reduce((sum, line) => sum + line.amountToInvoice, 0)),
    pendingDeliveries: Number(pendingDeliveries),
    draftInvoices: invoices.filter((invoice) => invoice.state === 'draft').map((invoice) => ({ name: String(invoice.name || 'Borrador'), amount: roundCurrency(numberValue(invoice.amount_untaxed_signed)) })),
    lines: detailLines.filter((line) => line.amountToInvoice !== 0 || line.toInvoice !== 0 || line.delivered !== line.invoiced),
  };
}
