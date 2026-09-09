import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinancialReport,
  calculateRegularCommission,
  defaultFinancialRange,
  filterFinancialLines,
  financialMargin,
  FINANCIAL_MAX_DAYS,
  FINANCIAL_PAGE_SIZE,
  GENERIC_TONER_CATEGORY_ID,
  previousFinancialRange,
  regularCommissionRate,
  summarizeFinancialLines,
  validateFinancialRange,
  type FinancialRange,
} from '../src/lib/gerencia/finanzas';
import {
  calculatePlatformBonus,
  getBogotaCalendarDate,
  PLATFORM_BONUS_PERCENT,
  roundCurrency,
} from '../src/lib/comisiones/bonoPlataforma';

import { canAccessDashboardPath } from '../src/lib/auth/routeAccess';

const DAY_MS = 86_400_000;

function timestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function inclusiveDays(range: FinancialRange): number {
  return (timestamp(range.to) - timestamp(range.from)) / DAY_MS + 1;
}

test('gerencia y detalle financiero requieren Dirección o Super Admin, también por rol extra', () => {
  for (const path of ['/dashboard/gerencia', '/dashboard/comisiones/asesoras/9', '/dashboard/comisiones/asesoras/none']) {
    assert.equal(canAccessDashboardPath('direccion', path), true);
    assert.equal(canAccessDashboardPath('super_admin', path), true);
    for (const role of ['asesor', 'comprador', 'aprobador', 'editor_contenido'] as const) assert.equal(canAccessDashboardPath(role, path), false);
    assert.equal(canAccessDashboardPath({ rol: 'asesor', rolesExtra: ['direccion'] }, path), true);
  }
  assert.equal(canAccessDashboardPath('asesor', '/dashboard/comisiones'), true);
});

test('fecha Bogotá: el mes financiero cambia a las 05:00 UTC, no a medianoche UTC', () => {
  for (const [instant, expected] of [
    ['2026-10-01T04:59:59.999Z', '2026-09-30'],
    ['2026-10-01T05:00:00.000Z', '2026-10-01'],
    ['2027-01-01T04:59:59.999Z', '2026-12-31'],
    ['2027-01-01T05:00:00.000Z', '2027-01-01'],
    ['2028-03-01T04:59:59.999Z', '2028-02-29'],
  ]) {
    const today = getBogotaCalendarDate(new Date(instant));
    assert.equal(today, expected);
    assert.deepEqual(defaultFinancialRange(today), { from: `${expected.slice(0, 7)}-01`, to: expected });
  }
});

test('preset mes actual: empieza el día uno y nunca añade días futuros', () => {
  for (const today of ['2026-09-01', '2026-09-28', '2026-12-31', '2027-01-01', '2028-02-29']) {
    const range = defaultFinancialRange(today);
    assert.deepEqual(range, { from: `${today.slice(0, 7)}-01`, to: today });
    assert.deepEqual(validateFinancialRange(range.from, range.to, today), range);
  }
  const before = getBogotaCalendarDate();
  const range = defaultFinancialRange();
  const after = getBogotaCalendarDate();
  assert.ok([before, after].includes(range.to));
  assert.equal(range.from, `${range.to.slice(0, 7)}-01`);
});

test('rango anterior: igual número de días inclusivos sin solapamiento entre meses o años', () => {
  const cases: [FinancialRange, FinancialRange][] = [
    [{ from: '2026-09-28', to: '2026-09-28' }, { from: '2026-09-27', to: '2026-09-27' }],
    [{ from: '2026-09-22', to: '2026-09-28' }, { from: '2026-09-15', to: '2026-09-21' }],
    [{ from: '2026-09-01', to: '2026-09-28' }, { from: '2026-08-04', to: '2026-08-31' }],
    [{ from: '2027-01-01', to: '2027-01-07' }, { from: '2026-12-25', to: '2026-12-31' }],
    [{ from: '2028-03-01', to: '2028-03-31' }, { from: '2028-01-30', to: '2028-02-29' }],
  ];
  for (const [current, expected] of cases) {
    const previous = previousFinancialRange(current);
    assert.deepEqual(previous, expected);
    assert.equal(inclusiveDays(previous), inclusiveDays(current));
    assert.equal(timestamp(previous.to) + DAY_MS, timestamp(current.from));
    assert.ok(previous.to < current.from);
  }
});

test('rango anterior: todos los tamaños autorizados mantienen días UTC exactos', () => {
  const start = timestamp('2028-03-01');
  for (let days = 1; days <= FINANCIAL_MAX_DAYS; days++) {
    const range = { from: '2028-03-01', to: new Date(start + (days - 1) * DAY_MS).toISOString().slice(0, 10) };
    const previous = previousFinancialRange(range);
    assert.equal(inclusiveDays(previous), days);
    assert.equal(timestamp(previous.to) + DAY_MS, start);
  }
});

test('límite inclusivo: acepta 366 días y rechaza 367, incluso en año bisiesto', () => {
  assert.equal(FINANCIAL_MAX_DAYS, 366);
  const range = validateFinancialRange('2028-01-01', '2028-12-31', '2029-01-01');
  assert.equal(inclusiveDays(range), 366);
  assert.equal(inclusiveDays(previousFinancialRange(range)), 366);
  assert.deepEqual(validateFinancialRange('2027-01-01', '2028-01-01', '2028-01-02'), {
    from: '2027-01-01', to: '2028-01-01',
  });
  assert.throws(() => validateFinancialRange('2028-01-01', '2029-01-01', '2029-01-01'), /366/);
  assert.throws(() => validateFinancialRange('2027-01-01', '2028-01-02', '2028-01-02'), /366/);
});

test('validación: acepta hoy en Bogotá y rechaza mañana aunque UTC ya haya cambiado de fecha', () => {
  const today = getBogotaCalendarDate(new Date('2026-10-01T04:59:59Z'));
  assert.deepEqual(validateFinancialRange(today, today, today), { from: today, to: today });
  assert.throws(() => validateFinancialRange('2026-09-30', '2026-10-01', today), /hoy en Colombia/);
  assert.throws(() => validateFinancialRange('2026-10-01', '2026-10-01', today), /hoy en Colombia/);
  assert.throws(() => validateFinancialRange('2026-09-29', '2026-09-28', today), /posterior/);
});

test('validación: rechaza fechas inexistentes, ambiguas y valores con hora o espacios', () => {
  const invalidDates = [
    '', '2026-2-01', '2026-02-1', '01/02/2026', '2026-02-29', '2026-02-30',
    '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '2026-09-01T00:00:00Z', ' 2026-09-01', '2026-09-01 ', 'no-es-fecha',
  ];
  for (const date of invalidDates) {
    assert.throws(() => validateFinancialRange(date, '2028-12-31', '2028-12-31'), date);
    assert.throws(() => validateFinancialRange('2028-01-01', date, '2028-12-31'), date);
    assert.throws(() => previousFinancialRange({ from: date, to: '2028-12-31' }), date);
    assert.throws(() => previousFinancialRange({ from: '2028-01-01', to: date }), date);
  }
  assert.deepEqual(validateFinancialRange('2028-02-29', '2028-02-29', '2028-03-01'), {
    from: '2028-02-29', to: '2028-02-29',
  });
});

test('comisión habitual: categoría real 26 al 2%, categoría real 25 al 1% y categoría ausente pendiente', () => {
  assert.equal(GENERIC_TONER_CATEGORY_ID, 26);
  const genericCategories = new Set([26]);
  assert.equal(regularCommissionRate(26, genericCategories), 2);
  assert.equal(regularCommissionRate(25, genericCategories), 1);
  assert.equal(regularCommissionRate(null, genericCategories), null);
});

test('aritmética de comisión: base neta al 1% o 2% sin sumar el bono separado del 0,5%', () => {
  assert.equal(PLATFORM_BONUS_PERCENT, 0.5);
  assert.equal(calculateRegularCommission(100, 1), 1);
  assert.equal(calculateRegularCommission(100, 2), 2);
  assert.equal(calculatePlatformBonus(100), 0.5);
  assert.equal(calculateRegularCommission(100, null), null);
  assert.equal(calculateRegularCommission(0, null), null);
  for (const rate of [1, 2]) assert.equal(calculateRegularCommission(0, rate), 0);
});

test('aritmética de devoluciones y descuentos: conserva bases y comisiones negativas', () => {
  for (const base of [0.5, 1.005, 100, 100.5, 12345.67]) {
    for (const rate of [1, 2]) {
      const commission = calculateRegularCommission(base, rate)!;
      assert.equal(calculateRegularCommission(-base, rate), commission === 0 ? 0 : -commission);
      assert.equal(commission, roundCurrency(base * rate / 100));
    }
  }
  assert.equal(calculateRegularCommission(-100, 1), -1);
  assert.equal(calculateRegularCommission(-100, 2), -2);
});

test('comisión: rechaza bases no finitas y tasas distintas de las dos autorizadas', () => {
  for (const base of [NaN, Infinity, -Infinity]) {
    for (const rate of [1, 2, null]) assert.throws(() => calculateRegularCommission(base, rate), /base/);
  }
  for (const rate of [0, 0.5, 1.5, 2.5, -1, 100, NaN, Infinity]) {
    assert.throws(() => calculateRegularCommission(100, rate), /1% o 2%/);
  }
});

test('redondeo monetario: centavos simétricos, medios centavos y ausencia de cero negativo', () => {
  for (const [input, expected] of [[1.005, 1.01], [10.075, 10.08], [123.454, 123.45], [0.005, 0.01]]) {
    assert.equal(roundCurrency(input), expected);
    assert.equal(roundCurrency(-input), -expected);
  }
  for (const value of [-0, -0.0001, 0, 0.0001]) assert.equal(roundCurrency(value), 0);
  assert.equal(calculateRegularCommission(100.5, 1), 1.01);
  assert.equal(calculateRegularCommission(-100.5, 1), -1.01);
  assert.equal(calculateRegularCommission(50.25, 2), 1.01);
  assert.equal(calculateRegularCommission(-50.25, 2), -1.01);
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => roundCurrency(value));
});

test('margen: conserva pérdidas y no valida una utilidad desconocida o una base neta no positiva', () => {
  assert.equal(financialMargin(1, 3), 33.33);
  assert.equal(financialMargin(-1, 3), -33.33);
  assert.equal(financialMargin(0, 100), 0);
  assert.equal(financialMargin(null, 100), null);
  assert.equal(financialMargin(100, 0), null);
  assert.equal(financialMargin(-10, -100), null);
});

test('sin filas: no inventa documentos, clientes ni rentabilidad porcentual', () => {
  assert.deepEqual(summarizeFinancialLines([]), {
    netSales: 0, invoicedSales: 0, creditNotes: 0,
    invoiceCount: 0, creditNoteCount: 0, clientCount: 0, lineCount: 0,
    cost: 0, profit: 0, knownCost: 0, verifiedProfit: 0,
    marginPercent: null, costCoveragePercent: null, missingCostLines: 0,
    commission: 0, knownCommission: 0, missingCommissionLines: 0, averageInvoice: null,
  });
  assert.deepEqual(filterFinancialLines([], { advisorId: null, page: 1 }), []);
});

test('reporte vacío: conserva rangos, pagina una sola vez y deduplica advertencias', () => {
  const range = { from: '2026-09-22', to: '2026-09-28' };
  const warnings = ['Consulta sin documentos', 'Consulta sin documentos'];
  const generatedAt = '2026-09-28T12:00:00Z';
  const report = buildFinancialReport([], range, { page: 100 }, generatedAt, warnings);
  assert.deepEqual(report.range, range);
  assert.deepEqual(report.previousRange, previousFinancialRange(range));
  assert.deepEqual(report.totals, summarizeFinancialLines([]));
  assert.deepEqual(report.previousTotals, summarizeFinancialLines([]));
  for (const rows of [report.lines, report.clients, report.advisors, report.products, report.trend]) assert.deepEqual(rows, []);
  assert.equal(report.currency, 'COP');
  assert.equal(report.generatedAt, generatedAt);
  assert.equal(FINANCIAL_PAGE_SIZE, 100);
  assert.deepEqual(report.pagination, { page: 1, pageSize: 100, total: 0, totalPages: 1 });
  assert.equal(report.filters.page, 1);
  assert.deepEqual(report.warnings, ['Consulta sin documentos']);
  assert.equal(warnings.length, 2);
});
