import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePurchaseLine, odooDateTimeToBogotaDate, purchaseHistoryRange, summarizePurchaseHistory,
  type PurchaseHistoryLine, type PurchaseUom, type RawPurchaseOrder,
} from '../src/lib/compras/historial';
import { canAccessDashboardPath } from '../src/lib/auth/routeAccess';

const units: PurchaseUom = { id: 1, name: 'Units', factor: 1, categoryId: 1 };
const COP = 8;
const order = (id: number, name: string, supplierId: number, supplierName: string, date: string): RawPurchaseOrder => ({
  id, name, supplierId, supplierName, currencyId: COP, currencyRate: 1, date,
});
// Órdenes de compra confirmadas reales del tóner genérico 1300200002 (producto 408), leídas de Odoo el 2026-11-06.
const real: [number, RawPurchaseOrder, number, number][] = [
  [87860, order(29164, 'P29163', 757, 'INVERSIONES GOMUVAL SAS', '2026-07-21'), 1, 31092.44],
  [87805, order(29139, 'P29138', 757, 'INVERSIONES GOMUVAL SAS', '2026-07-21'), 1, 31092],
  [87659, order(29042, 'P29041', 687, 'QP TECHNOLOGY SAS', '2026-07-10'), 15, 337500],
  [87268, order(28986, 'P28985', 757, 'INVERSIONES GOMUVAL SAS', '2026-07-09'), 2, 62184],
  [83821, order(27754, 'P27753', 687, 'QP TECHNOLOGY SAS', '2026-04-20'), 10, 225000],
  [78995, order(26074, 'P26074', 687, 'QP TECHNOLOGY SAS', '2026-01-13'), 15, 360000],
];

test('historial de compras real del tóner 1300200002: costo más bajo, último y promedio ponderado', () => {
  const lines = real.map(([id, purchaseOrder, quantity, subtotal]) => {
    const result = normalizePurchaseLine({ id, orderId: purchaseOrder.id, quantity, subtotal, lineUom: units, productUom: units }, purchaseOrder, COP);
    assert.ok('line' in result);
    return result.line;
  });
  assert.deepEqual(lines.map(line => line.unitCost), [31092.44, 31092, 22500, 31092, 22500, 24000]);
  assert.deepEqual(summarizePurchaseHistory(lines), {
    purchaseCount: 6, orderCount: 6, supplierCount: 2, totalQuantity: 44,
    lowest: { unitCost: 22500, supplierName: 'QP TECHNOLOGY SAS', date: '2026-07-10', orderName: 'P29041' },
    last: { unitCost: 31092.44, supplierName: 'INVERSIONES GOMUVAL SAS', date: '2026-07-21', orderName: 'P29163' },
    averageUnitCost: 23792.46,
  });
  const empty = summarizePurchaseHistory([]);
  assert.deepEqual([empty.lowest, empty.last, empty.averageUnitCost, empty.purchaseCount], [null, null, null, 0]);
});

test('historial de compras: excluye cantidades, subtotales, fechas y unidades no válidas en vez de inventar costos', () => {
  const [id, purchaseOrder] = real[0];
  const base = { id, orderId: purchaseOrder.id, quantity: 1, subtotal: 31092.44, lineUom: units, productUom: units };
  assert.match((normalizePurchaseLine({ ...base, quantity: 0 }, purchaseOrder, COP) as { issue: string }).issue, /Cantidad/);
  assert.match((normalizePurchaseLine({ ...base, subtotal: 0 }, purchaseOrder, COP) as { issue: string }).issue, /bonificación/);
  assert.match((normalizePurchaseLine(base, { ...purchaseOrder, date: null }, COP) as { issue: string }).issue, /fecha/);
  assert.match((normalizePurchaseLine(base, { ...purchaseOrder, currencyId: 2, currencyRate: false }, COP) as { issue: string }).issue, /tasa/);
  assert.match((normalizePurchaseLine({ ...base, lineUom: { ...units, id: 9, categoryId: 4 } }, purchaseOrder, COP) as { issue: string }).issue, /convertible/);
  assert.throws(() => summarizePurchaseHistory([{ ...(normalizePurchaseLine(base, purchaseOrder, COP) as { line: PurchaseHistoryLine }).line, quantity: 0 }]));
});

test('historial de compras: últimos 12 meses en hora de Bogotá y acceso por rol', () => {
  assert.deepEqual(purchaseHistoryRange('2026-11-06'), { from: '2025-11-07', to: '2026-11-06' });
  assert.deepEqual(purchaseHistoryRange('2028-02-29'), { from: '2027-03-01', to: '2028-02-29' });
  assert.throws(() => purchaseHistoryRange('2026-02-30'));
  assert.equal(odooDateTimeToBogotaDate('2026-07-11 03:30:00'), '2026-07-10');
  assert.equal(odooDateTimeToBogotaDate('2026-07-10 15:00:00'), '2026-07-10');
  assert.equal(odooDateTimeToBogotaDate(false), null);
  for (const role of ['asesor', 'direccion', 'compras', 'super_admin'] as const) assert.equal(canAccessDashboardPath(role, '/dashboard/compras'), true);
  for (const role of ['comprador', 'aprobador', 'editor_contenido'] as const) assert.equal(canAccessDashboardPath(role, '/dashboard/compras'), false);
  for (const path of ['/dashboard/pedidos', '/dashboard/catalogo']) assert.equal(canAccessDashboardPath('compras', path), true);
  for (const path of ['/dashboard/leads', '/admin/leads', '/dashboard/gerencia', '/dashboard/comisiones']) assert.equal(canAccessDashboardPath('compras', path), false);
});
