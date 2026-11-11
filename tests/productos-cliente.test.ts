import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOdooPricelistCsv, buildWorkCsv, summarizeCustomerProducts, type CustomerProductsReport } from '../src/lib/gerencia/productosCliente';

const products = new Map([
  [408, { id: 408, sku: '1300200002', name: 'TONER GENERICO STONER HPCF280X/CE505X', unitName: 'Units' }],
  [13472, { id: 13472, sku: '1600400497', name: 'CAJA FUERTE SUPER BLINDADA CON CERRADURA DIGITAL 89X50X50 CM', unitName: 'Units' }],
]);
// Líneas reales de facturas de octubre de 2026 en Odoo (INIM23860 e INIM23422).
const lines = [
  { id: 949874, moveId: 276947, documentType: 'out_invoice' as const, invoiceDate: '2026-10-22', productId: 408, quantity: 3, unitName: 'Units' },
  { id: 938082, moveId: 273872, documentType: 'out_invoice' as const, invoiceDate: '2026-10-02', productId: 13472, quantity: 1, unitName: 'Units' },
];

test('productos por cliente: agrupa por producto con SKU, cantidad, veces comprado y última compra', () => {
  const summary = summarizeCustomerProducts(lines, products);
  assert.deepEqual(summary.map(product => [product.sku, product.quantity, product.purchaseCount, product.lastPurchase, product.mixedUnits]), [
    ['1300200002', 3, 1, '2026-10-22', false], ['1600400497', 1, 1, '2026-10-02', false],
  ]);
  assert.throws(() => summarizeCustomerProducts([{ ...lines[0], productId: 999 }], products));
  assert.throws(() => summarizeCustomerProducts([{ ...lines[0], quantity: Number.NaN }], products));
});

test('productos por cliente: Excel para trabajar y archivo de reglas de tarifa para Odoo, sin precios', () => {
  const report: CustomerProductsReport = {
    company: { id: 1, name: 'INVERSIONES IMPRIMA SAS' }, customer: { id: 78, name: 'SUPER MERCADO BOOM S.A.S.', vat: null, pricelistName: null },
    range: { from: '2025-11-12', to: '2026-11-11' }, generatedAt: '2026-11-11T15:00:00Z', invoiceCount: 1,
    products: summarizeCustomerProducts(lines, products), warnings: [],
  };
  const work = buildWorkCsv(report).split('\r\n');
  assert.equal(work[0], '\uFEFFSKU;Producto;Unidad;Cantidad facturada (neta);Veces comprado;Última compra;Precio nuevo (sin IVA)');
  assert.equal(work[1], '1300200002;TONER GENERICO STONER HPCF280X/CE505X;Units;3;1;2026-10-22;');
  const odoo = buildOdooPricelistCsv(report).split('\r\n');
  assert.equal(odoo[0], 'pricelist_id,applied_on,product_id,compute_price,fixed_price,min_quantity');
  assert.equal(odoo[1], 'Tarifa SUPER MERCADO BOOM S.A.S.,0_product_variant,[1300200002] TONER GENERICO STONER HPCF280X/CE505X,fixed,,0');
  assert.equal(odoo.length, 3);
});
