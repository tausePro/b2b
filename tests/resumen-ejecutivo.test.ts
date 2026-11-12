import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExecutiveMonths, buildPeriodKpis, daysBetween, executiveRange, lastDayOfMonth, marginPercent, percentChange, salesOnlySummary, samePeriod, shiftMonth, staleOrders,
  type ExecutiveOrderToInvoice, type ExecutiveSummary, type MonthTotals,
} from '../src/lib/gerencia/resumen';

// Totales reales de cabecera en Odoo (INVERSIONES IMPRIMA SAS), leídos el 2026-11-11.
const OCT_2026: MonthTotals = { sales: 607606414.28, cost: 401836600.94, profit: 205769813.34, documents: 684 };
const SEP_2026: MonthTotals = { sales: 600459626.12, cost: 406303434.65, profit: 194156191.47, documents: 849 };
const OCT_2025: MonthTotals = { sales: 580387608.74, cost: 393126412.43, profit: 207384796.31, documents: 662 };
const NOV_2026_AL_11: MonthTotals = { sales: 192964561.85, cost: 112974387.68, profit: 79990174.17, documents: 297 };
const OCT_2026_AL_11: MonthTotals = { sales: 317982073.28, cost: 202884778.45, profit: 115097294.83, documents: 337 };
const NOV_2025_AL_11: MonthTotals = { sales: 194446535, cost: 114419485.78, profit: 80027049.22, documents: 267 };

test('resumen ejecutivo: mes a mes real contra el mes anterior y el mismo mes del año anterior', () => {
  const buckets = new Map([['2026-11', NOV_2026_AL_11], ['2026-10', OCT_2026], ['2026-09', SEP_2026], ['2025-10', OCT_2025]]);
  const months = buildExecutiveMonths(buckets, '2026-11-11', { previousMonth: OCT_2026_AL_11, previousYear: NOV_2025_AL_11 });
  assert.equal(months.length, 12);
  assert.deepEqual([months[0].month, months[1].month, months[2].month, months[11].month], ['2026-11', '2026-10', '2026-09', '2025-12']);
  const [current, october, september] = months;
  assert.equal(current.partial, true);
  assert.equal(current.marginPercent, 41.45);
  assert.deepEqual([current.salesVsPreviousMonth, current.salesVsPreviousYear, current.profitVsPreviousMonth, current.profitVsPreviousYear], [-39.32, -0.76, -30.5, -0.05]);
  assert.equal(october.partial, false);
  assert.equal(october.marginPercent, 33.87);
  assert.deepEqual([october.salesVsPreviousMonth, october.salesVsPreviousYear, october.profitVsPreviousMonth, october.profitVsPreviousYear], [1.19, 4.69, 5.98, -0.78]);
  assert.deepEqual([september.salesVsPreviousMonth, september.salesVsPreviousYear], [null, null]);
  assert.deepEqual(months[3], { ...months[3], sales: 0, profit: 0, documents: 0, marginPercent: null });
});

test('resumen ejecutivo: mismo período del mes en curso, 24 meses de base y variaciones sin base', () => {
  assert.deepEqual(samePeriod('2026-11-11', -1), { from: '2026-10-01', to: '2026-10-11' });
  assert.deepEqual(samePeriod('2026-11-11', -12), { from: '2025-11-01', to: '2025-11-11' });
  assert.deepEqual(samePeriod('2026-03-31', -1), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(samePeriod('2028-02-29', -12), { from: '2027-02-01', to: '2027-02-28' });
  assert.deepEqual(executiveRange('2026-11-11'), { from: '2024-12-01', to: '2026-11-11' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(-50, -100), 50);
  assert.equal(marginPercent({ sales: 0, cost: 0, profit: 0, documents: 0 }), null);
  assert.throws(() => samePeriod('2026-02-30', -1));
});

test('foto de la empresa para Cartera: conserva facturación y pendientes reales, sin costos, utilidad ni márgenes', () => {
  const months = buildExecutiveMonths(new Map([['2026-10', OCT_2026], ['2026-09', SEP_2026], ['2025-10', OCT_2025]]), '2026-11-11', { previousMonth: OCT_2026_AL_11, previousYear: NOV_2025_AL_11 });
  const summary: ExecutiveSummary = {
    currency: 'COP', scope: 'full', company: { id: 1, name: 'INVERSIONES IMPRIMA SAS' }, asOfDate: '2026-11-11', generatedAt: '2026-11-11T15:00:00Z', months,
    currentPeriod: { range: { from: '2026-11-01', to: '2026-11-11' }, previousMonthRange: samePeriod('2026-11-11', -1), previousYearRange: samePeriod('2026-11-11', -12) },
    drafts: { count: 6, untaxed: 1665860, invoices: 5, creditNotes: 1, items: [] },
    toInvoice: { orderCount: 255, lineCount: 944, untaxed: 292197763.06, orders: [], byAdvisor: [], stale: { days: 15, count: 72, amount: 117838598, orderNames: ['S01515', 'S22012', 'S22819'] } },
    zeroCostGoods: {
      current: { range: { from: '2026-11-01', to: '2026-11-12' }, lineCount: 0, sales: 0 },
      previousMonth: { range: { from: '2026-10-01', to: '2026-10-31' }, lineCount: 2, sales: 342000 },
    },
    warnings: [],
  };
  const limited = salesOnlySummary(summary);
  assert.equal(limited.scope, 'sales');
  assert.deepEqual(limited.months.map(month => [month.sales, month.documents, month.salesVsPreviousMonth, month.salesVsPreviousYear]), months.map(month => [month.sales, month.documents, month.salesVsPreviousMonth, month.salesVsPreviousYear]));
  assert.ok(limited.months.every(month => month.cost === 0 && month.profit === 0 && month.marginPercent === null
    && month.profitVsPreviousMonth === null && month.profitVsPreviousYear === null
    && month.previousMonth.profit === 0 && month.previousMonth.cost === 0 && month.previousYear.profit === 0 && month.previousYear.cost === 0));
  assert.deepEqual([limited.months[1].salesVsPreviousMonth, limited.months[1].salesVsPreviousYear], [1.19, 4.69]);
  assert.deepEqual([limited.toInvoice.untaxed, limited.drafts.untaxed, summary.months[1].profit], [292197763.06, 1665860, 205769813.34]);
});

// Pedidos reales por facturar al 2026-11-12 (los tres de mayor saldo).
const ORDERS_2026_11_12: ExecutiveOrderToInvoice[] = [
  { id: 46710, name: 'S47287', partnerName: 'TCC SAS', advisorName: 'DIANA MARIA CAYCEDO RUEDA', date: '2026-10-21', ageDays: 22, amountToInvoice: 33320000 },
  { id: 46813, name: 'S47390', partnerName: 'ARIS MINING MARMATO S.A.S.', advisorName: 'GLORIA PATRICIA GOMEZ MONCADA', date: '2026-10-26', ageDays: 17, amountToInvoice: 24130000 },
  { id: 47173, name: 'S47750', partnerName: 'ARIS MINING SEGOVIA', advisorName: 'GLORIA PATRICIA GOMEZ MONCADA', date: '2026-11-10', ageDays: 2, amountToInvoice: 20516400 },
];

test('requiere atención: pedidos con más de 15 días sin facturar, del más antiguo al más reciente', () => {
  assert.equal(daysBetween('2026-10-21', '2026-11-12'), 22);
  assert.equal(daysBetween('2026-11-10', '2026-11-12'), 2);
  assert.equal(lastDayOfMonth('2026-02'), '2026-02-28');
  assert.equal(lastDayOfMonth('2028-02'), '2028-02-29');
  assert.deepEqual(staleOrders(ORDERS_2026_11_12), { days: 15, count: 2, amount: 57450000, orderNames: ['S47287', 'S47390'] });
  assert.deepEqual(staleOrders(ORDERS_2026_11_12, 20).orderNames, ['S47287']);
});

test('indicadores por período: mes en curso, mes anterior y año a la fecha con datos reales', () => {
  const NOV_2026_AL_12: MonthTotals = { sales: 216363701.85, cost: 129902230.48, profit: 86461471.37, documents: 351 };
  const OCT_2026_AL_12: MonthTotals = { sales: 317982073.28, cost: 202884778.45, profit: 115097294.83, documents: 337 };
  const NOV_2025_AL_12: MonthTotals = { sales: 213617891, cost: 127345170.22, profit: 86272720.78, documents: 288 };
  const months = buildExecutiveMonths(new Map([['2026-11', NOV_2026_AL_12], ['2026-10', OCT_2026], ['2026-09', SEP_2026], ['2025-10', OCT_2025]]), '2026-11-12', { previousMonth: OCT_2026_AL_12, previousYear: NOV_2025_AL_12 });
  const [mes, mesAnterior, anio] = buildPeriodKpis(months);
  assert.deepEqual([mes.period, mes.totals.sales, mes.marginPercent, mes.comparisons.map(c => c.totals.sales)], ['mes', 216363701.85, 39.96, [317982073.28, 213617891]]);
  assert.deepEqual([mesAnterior.period, mesAnterior.totals.sales, mesAnterior.marginPercent, mesAnterior.comparisons.map(c => c.totals.sales)], ['mes_anterior', 607606414.28, 33.87, [600459626.12, 580387608.74]]);
  assert.equal(anio.period, 'anio');
  assert.equal(anio.totals.sales, 1424429742.25);
  assert.equal(anio.totals.profit, 486387476.18);
  assert.deepEqual(anio.comparisons.map(c => [c.label, c.totals.sales]), [['2025 (mismo período)', 794005499.74]]);
});
