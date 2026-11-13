import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMonths, bogotaMonth, buildLiquidationCsv, consecutiveMonthsWithoutOrders, defaultLiquidationMonth, liquidateClient, monthRange, platformFee, summarizeLiquidation,
  type LiquidationClientInput,
} from '../src/lib/plataforma/liquidacion';

// Casos reales de la plataforma (pedidos del portal y neto facturado en Odoo, sep-oct 2026).
const client = (name: string, activationMonth: string, orderMonths: string[], ordersInMonth: number, netInvoiced: number): LiquidationClientInput => ({
  companyId: name, name, activationMonth, orderMonths, ordersInMonth, netInvoiced, invoices: [],
});

test('liquidación: meses calendario, mes por defecto y fecha de Bogotá', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(defaultLiquidationMonth('2026-11-01'), '2026-10');
  assert.equal(defaultLiquidationMonth('2027-01-15'), '2026-12');
  // Un pedido del 31 de octubre a las 10 p. m. en Bogotá ya es 1 de noviembre en UTC.
  assert.equal(bogotaMonth('2026-11-01T03:00:00Z'), '2026-10');
});

test('liquidación: $25.000 por debajo de $500.000 neto y $50.000 desde $500.000', () => {
  assert.deepEqual([platformFee(0), platformFee(341_600), platformFee(499_999.99), platformFee(500_000), platformFee(501_600)], [25_000, 25_000, 25_000, 50_000, 50_000]);
});

test('liquidación: con más de 2 meses calendario seguidos sin pedir el cliente no paga', () => {
  assert.equal(consecutiveMonthsWithoutOrders(['2026-06'], '2026-09', '2026-06'), 3);
  const elite = liquidateClient(client('ELITE CARE ASSIST S.A.S.', '2026-06', ['2026-06'], 0, 0), '2026-09')!;
  assert.deepEqual([elite.status, elite.monthsWithoutOrders, elite.fee], ['no_paga', 3, 0]);
  const deeplink = liquidateClient(client('DEEPLINK S.A.S', '2026-09', ['2026-09', '2026-11'], 0, 0), '2026-10')!;
  assert.deepEqual([deeplink.status, deeplink.monthsWithoutOrders, deeplink.fee], ['gracia', 1, 25_000]);
  assert.equal(liquidateClient(client('DEEPLINK S.A.S', '2026-09', ['2026-09', '2026-11'], 1, 0), '2026-11')!.status, 'pidio');
  assert.equal(liquidateClient(client('TANQUES Y CAMIONES S.A.S.', '2026-10', ['2026-10'], 0, 0), '2026-09'), null);
});

test('liquidación real de octubre de 2026: 10 clientes pagan $400.000', () => {
  const october = [
    client('ARIS MINING SEGOVIA', '2026-03', ['2026-03', '2026-10'], 1, 5_976_050), client('MEDICAL SHAPES S.A.S.', '2026-05', ['2026-05', '2026-10'], 3, 2_311_900),
    client('SURAGAS S.A', '2026-04', ['2026-04', '2026-10'], 1, 1_447_506), client('F&I SAS', '2026-08', ['2026-08', '2026-09'], 0, 1_304_650),
    client('TANQUES Y CAMIONES S.A.S.', '2026-10', ['2026-10'], 1, 1_134_450), client('48 HOORASS DIA SJ S.A.S.', '2026-06', ['2026-06', '2026-09'], 0, 661_210),
    client('VIAJES COLEGIOS Y TURISMO S.A.', '2026-05', ['2026-05', '2026-10'], 3, 341_600), client('ASOCIACION MUTUAL DE MINEROS', '2026-10', ['2026-10'], 3, 0),
    client('DEEPLINK S.A.S', '2026-09', ['2026-09'], 0, 0), client('HONGDA LIAN SHAO COLOMBIA SAS', '2026-10', ['2026-10'], 1, 0),
    client('ELITE CARE ASSIST S.A.S.', '2026-06', ['2026-06'], 0, 0),
  ].map((input) => liquidateClient(input, '2026-10')!);
  assert.deepEqual(summarizeLiquidation(october), { clients: 11, paying: 10, highFee: 6, lowFee: 4, notPaying: 1, totalFee: 400_000, totalNet: 13_177_366 });
  const csv = buildLiquidationCsv('2026-10', october);
  assert.ok(csv.startsWith('\uFEFFMes;Cliente;Primer pedido'));
  assert.ok(csv.includes('2026-10;F&I SAS;2026-08;0;1304650.00;1;Sin pedidos (paga);50000;'));
  assert.ok(csv.trimEnd().endsWith(';TOTAL;;;13177366.00;;;400000;'));
});
