import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOdooPricelistCsv, buildWorkCsv, summarizeCustomerProducts, type CustomerProductsReport } from '../src/lib/gerencia/productosCliente';

const products = new Map([
  [408, { id: 408, sku: '1300200002', name: 'TONER GENERICO STONER HPCF280X/CE505X', unitName: 'Units' }],
  [13472, { id: 13472, sku: '1600400497', name: 'CAJA FUERTE SUPER BLINDADA CON CERRADURA DIGITAL 89X50X50 CM', unitName: 'Units' }],
]);
// Líneas reales de facturas de octubre de 2026 en Odoo (INIM23860 e INIM23422), con su precio sin IVA.
const lines = [
  { id: 949874, moveId: 276947, documentType: 'out_invoice' as const, invoiceDate: '2026-10-22', productId: 408, quantity: 3, unitName: 'Units', unitPrice: 35000, subtotal: 105000 },
  { id: 938082, moveId: 273872, documentType: 'out_invoice' as const, invoiceDate: '2026-10-02', productId: 13472, quantity: 1, unitName: 'Units', unitPrice: 14800000, subtotal: 14800000 },
];
// Líneas reales de la UPS CDP 1000VA (producto 12441) facturadas a HOGAR Y MODA SAS en 2026.
const ups = [
  { id: 825070, moveId: 239873, documentType: 'out_invoice' as const, invoiceDate: '2026-02-17', productId: 12441, quantity: 1, unitName: 'Units', unitPrice: 174300, subtotal: 174300 },
  { id: 845948, moveId: 245434, documentType: 'out_invoice' as const, invoiceDate: '2026-04-06', productId: 12441, quantity: 2, unitName: 'Units', unitPrice: 167970, subtotal: 335940 },
  { id: 885046, moveId: 256376, documentType: 'out_invoice' as const, invoiceDate: '2026-07-15', productId: 12441, quantity: 1, unitName: 'Units', unitPrice: 174300, subtotal: 174300 },
  { id: 911658, moveId: 266114, documentType: 'out_invoice' as const, invoiceDate: '2026-08-03', productId: 12441, quantity: 5, unitName: 'Units', unitPrice: 194400, subtotal: 972000 },
];
const upsProduct = new Map([[12441, { id: 12441, sku: '1400301537', name: 'UPS INTERACTIVA CDP 1000VA/500W', unitName: 'Units' }]]);

test('productos por cliente: agrupa por producto con SKU, cantidad, veces comprado y última compra', () => {
  const summary = summarizeCustomerProducts(lines, products);
  assert.deepEqual(summary.map(product => [product.sku, product.quantity, product.purchaseCount, product.lastPurchase, product.mixedUnits]), [
    ['1300200002', 3, 1, '2026-10-22', false], ['1600400497', 1, 1, '2026-10-02', false],
  ]);
  assert.throws(() => summarizeCustomerProducts([{ ...lines[0], productId: 999 }], products));
  assert.throws(() => summarizeCustomerProducts([{ ...lines[0], quantity: Number.NaN }], products));
  assert.throws(() => summarizeCustomerProducts([{ ...lines[0], unitPrice: Number.NaN }], products));
});

test('productos por cliente: último precio facturado y promedio ponderado del período', () => {
  const [product] = summarizeCustomerProducts([...ups].reverse(), upsProduct);
  assert.deepEqual([product.lastUnitPrice, product.lastPriceDate, product.averageUnitPrice, product.purchaseCount, product.quantity], [194400, '2026-08-03', 184060, 4, 9]);
});

test('productos por cliente: Excel con precios de referencia y archivo de reglas de tarifa para Odoo con precio fijo vacío', () => {
  const report: CustomerProductsReport = {
    company: { id: 1, name: 'INVERSIONES IMPRIMA SAS' }, customer: { id: 78, name: 'SUPER MERCADO BOOM S.A.S.', vat: null, pricelistName: null },
    range: { from: '2025-11-12', to: '2026-11-11' }, generatedAt: '2026-11-11T15:00:00Z', invoiceCount: 1,
    products: summarizeCustomerProducts(lines, products), warnings: [],
  };
  const work = buildWorkCsv(report).split('\r\n');
  assert.equal(work[0], '\uFEFFSKU;Producto;Unidad;Cantidad facturada (neta);Veces comprado;Última compra;Último precio (sin IVA);Fecha último precio;Precio promedio (sin IVA);Precio nuevo (sin IVA)');
  assert.equal(work[1], '1300200002;TONER GENERICO STONER HPCF280X/CE505X;Units;3;1;2026-10-22;35000;2026-10-22;35000;');
  const odoo = buildOdooPricelistCsv(report).split('\r\n');
  assert.equal(odoo[0], 'pricelist_id,applied_on,product_id,compute_price,fixed_price,min_quantity');
  assert.equal(odoo[1], 'Tarifa SUPER MERCADO BOOM S.A.S.,0_product_variant,[1300200002] TONER GENERICO STONER HPCF280X/CE505X,fixed,,0');
  assert.equal(odoo.length, 3);
});
