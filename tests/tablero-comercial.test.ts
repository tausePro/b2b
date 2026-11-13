import assert from 'node:assert/strict';
import test from 'node:test';
import { clientAlert, daysBetweenDates, goalProgress, monthProjection, purchasePattern, trendStatus } from '../src/lib/comercial/tablero';

// Fechas reales de factura de SUPER MERCADO BOOM (cliente 78 en Odoo), jun-2025 a ago-2026.
const BOOM = ['2025-06-04', '2025-06-20', '2025-06-24', '2025-07-02', '2025-07-16', '2025-08-20', '2025-10-18', '2025-10-24', '2025-11-01', '2025-11-18',
  '2025-12-01', '2025-12-12', '2025-12-23', '2026-01-06', '2026-01-21', '2026-02-02', '2026-02-09', '2026-02-12', '2026-03-06', '2026-03-24',
  '2026-04-15', '2026-04-17', '2026-04-23', '2026-05-07', '2026-05-26', '2026-06-03', '2026-07-10', '2026-07-16', '2026-08-06'];

test('tablero comercial: el ritmo de compra se aprende de las fechas reales del cliente', () => {
  assert.deepEqual(purchasePattern(BOOM), { purchases: 29, medianDays: 14, p25Days: 8, p75Days: 18 });
  assert.deepEqual(purchasePattern([...BOOM, '2026-08-06', '2026-08-06T15:00:00']), { purchases: 29, medianDays: 14, p25Days: 8, p75Days: 18 });
  assert.equal(purchasePattern(['2026-07-10', '2026-08-06']), null);
  assert.equal(daysBetweenDates('2026-08-06', '2026-11-12'), 98);
});

test('tablero comercial: seguimiento al salir de su rango normal y prioritaria al doblar su intervalo', () => {
  const pattern = purchasePattern(BOOM);
  assert.deepEqual(clientAlert('2026-08-06', '2026-08-20', pattern).level, 'al_dia');
  assert.deepEqual(clientAlert('2026-08-06', '2026-08-30', pattern).level, 'seguimiento');
  const alert = clientAlert('2026-08-06', '2026-11-12', pattern);
  assert.deepEqual([alert.level, alert.daysSince, alert.followAfter, alert.priorityAfter, alert.usesPattern], ['prioritaria', 98, 18, 28, true]);
  assert.equal(alert.reason, 'Compra cada ~14 días (normal 8–18); lleva 98 días sin comprar');
});

test('tablero comercial: sin ritmo se usa 30 y 60 días; el ajuste por cliente manda sobre el ritmo', () => {
  const sinRitmo = clientAlert('2026-08-06', '2026-09-10', null);
  assert.deepEqual([sinRitmo.level, sinRitmo.daysSince, sinRitmo.reason], ['seguimiento', 35, 'Sin ritmo definido (menos de 3 compras); lleva 35 días sin comprar']);
  assert.equal(clientAlert('2026-08-06', '2026-10-10', null).level, 'prioritaria');
  const ajustado = clientAlert('2026-08-06', '2026-11-12', purchasePattern(BOOM), { followUpDays: 45, priorityDays: 120 });
  assert.deepEqual([ajustado.level, ajustado.usesPattern], ['seguimiento', false]);
  assert.equal(ajustado.reason, 'Umbral ajustado: seguimiento a 45 días, prioritaria a 120; lleva 98 días sin comprar');
});

test('tablero comercial: tendencia ±5 %, proyección al cierre y cumplimiento de meta', () => {
  assert.deepEqual([6, 5, -5, -5.1, null].map(trendStatus), ['creciendo', 'estable', 'estable', 'bajando', null]);
  // Venta real de la compañía del 1 al 12 de noviembre de 2026.
  assert.equal(monthProjection(216363701.85, '2026-11-12'), 540909254.63);
  assert.equal(goalProgress(216363701.85, 500000000), 43.3);
  assert.deepEqual([goalProgress(1, null), goalProgress(1, 0)], [null, null]);
});
