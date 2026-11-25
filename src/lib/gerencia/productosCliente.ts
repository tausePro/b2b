import { escapeCsvCell } from '@/lib/informes/pedidos';

export interface CustomerSearchResult { id: number; name: string; vat: string | null; pricelistName: string | null; lastInvoiceDate: string | null }
export interface CustomerProduct {
  productId: number;
  sku: string | null;
  name: string;
  unitName: string;
  mixedUnits: boolean;
  quantity: number;
  purchaseCount: number;
  lastPurchase: string | null;
  /** Último precio unitario facturado (sin IVA, con descuento) y su fecha. */
  lastUnitPrice: number | null;
  lastPriceDate: string | null;
  /** Promedio ponderado del período: valor facturado / cantidad facturada (sin notas crédito). */
  averageUnitPrice: number | null;
}
export interface CustomerProductsReport {
  company: { id: number; name: string };
  customer: { id: number; name: string; vat: string | null; pricelistName: string | null };
  range: { from: string; to: string };
  generatedAt: string;
  invoiceCount: number;
  products: CustomerProduct[];
  warnings: string[];
}
export interface CustomerInvoiceLine {
  id: number;
  moveId: number;
  documentType: 'out_invoice' | 'out_refund';
  invoiceDate: string;
  productId: number;
  quantity: number;
  unitName: string;
  /** Precio unitario sin IVA con el descuento aplicado. */
  unitPrice: number;
  /** Subtotal sin IVA de la línea. */
  subtotal: number;
}
export interface CustomerProductInfo { id: number; sku: string | null; name: string; unitName: string }

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000 || 0;
const roundPrice = (value: number) => Math.round(value * 100) / 100;

type ProductGroup = {
  quantity: number; invoices: Set<number>; lastPurchase: string | null; units: Set<string>;
  invoicedQuantity: number; invoicedValue: number; lastPriceLine: CustomerInvoiceLine | null;
};

/** Agrupa las líneas facturadas por producto: cantidad neta (facturas menos notas crédito), veces comprado, última compra y precios. */
export function summarizeCustomerProducts(lines: readonly CustomerInvoiceLine[], products: ReadonlyMap<number, CustomerProductInfo>): CustomerProduct[] {
  const groups = new Map<number, ProductGroup>();
  for (const line of lines) {
    if (!Number.isFinite(line.quantity)) throw new Error('Cantidad facturada no válida.');
    if (!Number.isFinite(line.unitPrice) || !Number.isFinite(line.subtotal)) throw new Error('Precio facturado no válido.');
    const group = groups.get(line.productId) ?? {
      quantity: 0, invoices: new Set<number>(), lastPurchase: null, units: new Set<string>(), invoicedQuantity: 0, invoicedValue: 0, lastPriceLine: null,
    };
    group.quantity += line.documentType === 'out_refund' ? -line.quantity : line.quantity;
    group.units.add(line.unitName);
    if (line.documentType === 'out_invoice') {
      group.invoices.add(line.moveId);
      if (!group.lastPurchase || line.invoiceDate > group.lastPurchase) group.lastPurchase = line.invoiceDate;
      group.invoicedQuantity += line.quantity;
      group.invoicedValue += line.subtotal;
      const last = group.lastPriceLine;
      if (!last || line.invoiceDate > last.invoiceDate || (line.invoiceDate === last.invoiceDate && line.id > last.id)) group.lastPriceLine = line;
    }
    groups.set(line.productId, group);
  }
  return [...groups].map(([productId, group]) => {
    const product = products.get(productId);
    if (!product) throw new Error('No se pudo leer un producto facturado.');
    return {
      productId, sku: product.sku, name: product.name, unitName: group.units.size === 1 ? [...group.units][0] : product.unitName,
      mixedUnits: group.units.size > 1, quantity: roundQuantity(group.quantity), purchaseCount: group.invoices.size, lastPurchase: group.lastPurchase,
      lastUnitPrice: group.lastPriceLine ? roundPrice(group.lastPriceLine.unitPrice) : null, lastPriceDate: group.lastPriceLine?.invoiceDate ?? null,
      averageUnitPrice: group.invoicedQuantity > 0 ? roundPrice(group.invoicedValue / group.invoicedQuantity) : null,
    };
  }).sort((a, b) => b.purchaseCount - a.purchaseCount || (b.lastPurchase ?? '').localeCompare(a.lastPurchase ?? '') || a.name.localeCompare(b.name, 'es'));
}

/** Excel para trabajar (separador ;, compatible con Excel en español), con último precio y promedio de referencia. "Precio nuevo" queda vacía para llenarla. */
export function buildWorkCsv(report: CustomerProductsReport): string {
  const headers = ['SKU', 'Producto', 'Unidad', 'Cantidad facturada (neta)', 'Veces comprado', 'Última compra', 'Último precio (sin IVA)', 'Fecha último precio', 'Precio promedio (sin IVA)', 'Precio nuevo (sin IVA)'];
  const rows = report.products.map(product => [
    product.sku ?? '', product.name, product.unitName, product.quantity, product.purchaseCount, product.lastPurchase ?? '',
    product.lastUnitPrice ?? '', product.lastPriceDate ?? '', product.averageUnitPrice ?? '', '',
  ]);
  return `\uFEFF${[headers, ...rows].map(row => row.map(escapeCsvCell).join(';')).join('\r\n')}`;
}

export function pricelistName(report: CustomerProductsReport): string {
  return `Tarifa ${report.customer.name}`.slice(0, 120);
}

/** Archivo para importar reglas de tarifa en Odoo (product.pricelist.item). El precio fijo queda vacío para llenarlo antes de importar. */
export function buildOdooPricelistCsv(report: CustomerProductsReport): string {
  const headers = ['pricelist_id', 'applied_on', 'product_id', 'compute_price', 'fixed_price', 'min_quantity'];
  const name = pricelistName(report);
  const rows = report.products.map(product => [name, '0_product_variant', product.sku ? `[${product.sku}] ${product.name.replace(/^\[[^\]]*\]\s*/, '')}` : product.name, 'fixed', '', 0]);
  return [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}
