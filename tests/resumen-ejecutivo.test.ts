import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutiveMonths, executiveRange, marginPercent, percentChange, samePeriod, shiftMonth, type MonthTotals } from '../src/lib/gerencia/resumen';

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
