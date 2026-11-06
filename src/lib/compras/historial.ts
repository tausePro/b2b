import { roundCurrency } from '@/lib/comisiones/bonoPlataforma';

export const PURCHASE_HISTORY_MONTHS = 12;
export const PURCHASE_SEARCH_LIMIT = 20;

export interface PurchaseCostPoint { unitCost: number; supplierName: string; date: string; orderName: string }
export interface PurchaseHistoryLine extends PurchaseCostPoint {
  id: number;
  orderId: number;
  supplierId: number | null;
  quantity: number;
  unitName: string;
  subtotal: number;
}
export interface PurchaseHistorySummary {
  purchaseCount: number;
  orderCount: number;
  supplierCount: number;
  totalQuantity: number;
  lowest: PurchaseCostPoint | null;
  last: PurchaseCostPoint | null;
  averageUnitCost: number | null;
}
export interface PurchaseProduct { id: number; name: string; sku: string | null; unitName: string }
export interface PurchaseProductSummary extends PurchaseProduct { summary: PurchaseHistorySummary }
export interface PurchaseHistoryRange { from: string; to: string }
export interface PurchaseCompany { id: number; name: string }
export interface PurchaseSearchReport {
  currency: 'COP';
  company: PurchaseCompany;
  range: PurchaseHistoryRange;
  generatedAt: string;
  products: PurchaseProductSummary[];
  warnings: string[];
}
export interface PurchaseHistoryReport {
  currency: 'COP';
  company: PurchaseCompany;
  range: PurchaseHistoryRange;
  generatedAt: string;
  product: PurchaseProduct;
  summary: PurchaseHistorySummary;
  lines: PurchaseHistoryLine[];
  warnings: string[];
}

export interface PurchaseUom { id: number; name: string; factor: number; categoryId: number | null }
export interface RawPurchaseLine { id: number; orderId: number; quantity: unknown; subtotal: unknown; lineUom: PurchaseUom | null; productUom: PurchaseUom | null }
export interface RawPurchaseOrder {
  id: number;
  name: string;
  supplierId: number | null;
  supplierName: string;
  currencyId: number | null;
  currencyRate: unknown;
  date: string | null;
}

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000 || 0;

export function purchaseHistoryRange(today: string): PurchaseHistoryRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  const [year, month, day] = match ? match.slice(1).map(Number) : [NaN, NaN, NaN];
  const end = new Date(Date.UTC(year, month - 1, day));
  if (!match || end.toISOString().slice(0, 10) !== today) throw new Error('Fecha de consulta no válida.');
  const start = new Date(Date.UTC(year - PURCHASE_HISTORY_MONTHS / 12, month - 1, day));
  if (start.getUTCMonth() !== month - 1) start.setUTCDate(0);
  start.setUTCDate(start.getUTCDate() + 1);
  return { from: start.toISOString().slice(0, 10), to: today };
}

export function odooDateTimeToBogotaDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value.replace(' ', 'T')}Z`);
  return Number.isFinite(time) ? new Date(time - 5 * 3600000).toISOString().slice(0, 10) : null;
}

export function normalizePurchaseLine(line: RawPurchaseLine, order: RawPurchaseOrder, companyCurrencyId: number): { line: PurchaseHistoryLine } | { issue: string } {
  const quantity = typeof line.quantity === 'number' ? line.quantity : NaN;
  const subtotal = typeof line.subtotal === 'number' ? line.subtotal : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0) return { issue: 'Cantidad no válida en la orden de compra.' };
  if (!Number.isFinite(subtotal) || subtotal < 0) return { issue: 'Subtotal no válido en la orden de compra.' };
  if (subtotal === 0) return { issue: 'Línea sin costo (bonificación o muestra): no cuenta para el costo más bajo.' };
  if (!order.date) return { issue: 'La orden de compra no tiene fecha válida.' };
  let subtotalCop = subtotal;
  if (order.currencyId !== companyCurrencyId) {
    const rate = typeof order.currencyRate === 'number' ? order.currencyRate : NaN;
    if (!Number.isFinite(rate) || rate <= 0) return { issue: 'Orden en otra moneda sin tasa de cambio válida.' };
    subtotalCop = subtotal / rate;
  }
  const { lineUom, productUom } = line;
  if (!lineUom || !productUom || !(lineUom.factor > 0) || !(productUom.factor > 0)) return { issue: 'Unidad de medida no válida.' };
  if (lineUom.id !== productUom.id && lineUom.categoryId !== productUom.categoryId) return { issue: 'La unidad de compra no es convertible a la unidad del producto.' };
  const productQuantity = lineUom.id === productUom.id ? quantity : quantity / lineUom.factor * productUom.factor;
  return {
    line: {
      id: line.id, orderId: order.id, orderName: order.name, supplierId: order.supplierId, supplierName: order.supplierName,
      date: order.date, quantity: roundQuantity(productQuantity), unitName: productUom.name,
      unitCost: roundCurrency(subtotalCop / productQuantity), subtotal: roundCurrency(subtotalCop),
    },
  };
}

export function summarizePurchaseHistory(lines: readonly PurchaseHistoryLine[]): PurchaseHistorySummary {
  if (lines.some(line => !Number.isFinite(line.unitCost) || !Number.isFinite(line.subtotal) || !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    throw new Error('Línea de compra no válida.');
  }
  const newer = (a: PurchaseHistoryLine, b: PurchaseHistoryLine) => a.date > b.date || (a.date === b.date && a.id > b.id);
  let lowest: PurchaseHistoryLine | null = null;
  let last: PurchaseHistoryLine | null = null;
  for (const line of lines) {
    if (!lowest || line.unitCost < lowest.unitCost || (line.unitCost === lowest.unitCost && newer(line, lowest))) lowest = line;
    if (!last || newer(line, last)) last = line;
  }
  const point = (line: PurchaseHistoryLine | null): PurchaseCostPoint | null => line && {
    unitCost: line.unitCost, supplierName: line.supplierName, date: line.date, orderName: line.orderName,
  };
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalSubtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  return {
    purchaseCount: lines.length,
    orderCount: new Set(lines.map(line => line.orderId)).size,
    supplierCount: new Set(lines.map(line => line.supplierId ?? line.supplierName)).size,
    totalQuantity: roundQuantity(totalQuantity),
    lowest: point(lowest),
    last: point(last),
    averageUnitCost: totalQuantity > 0 ? roundCurrency(totalSubtotal / totalQuantity) : null,
  };
}
