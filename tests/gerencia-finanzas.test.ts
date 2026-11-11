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
  decodeFinancialReport,
  encodeFinancialReport,
  hasZeroRecordedCost,
  isZeroCostService,
  lineCommissionRule,
  needsCostReview,
  PENDING_MARGIN_COMMISSION_ISSUE,
  previousFinancialRange,
  financialComparison,
  regularCommissionRate,
  summarizeFinancialLines,
  validateFinancialRange,
  ZERO_RECORDED_COST_ISSUE,
  type FinancialRange,
} from '../src/lib/gerencia/finanzas';
import { normalizeFinancialLine } from '../src/lib/gerencia/finanzas.server';
import {
  calculatePlatformBonus,
  getBogotaCalendarDate,
  PLATFORM_BONUS_PERCENT,
  roundCurrency,
} from '../src/lib/comisiones/bonoPlataforma';

import { canAccessDashboardPath } from '../src/lib/auth/routeAccess';
import { buildOpenBalanceReport, overdueDays, receivableOnlyReport, summarizeOpenBalances, summarizeOpenInvoices, type OpenInvoiceDocument } from '../src/lib/gerencia/cartera';
import { PACKAGING_CATEGORY_ID, nextCommissionMonth, regularCommissionKind, regularCommissionPeriod, summarizeRegularCommissions } from '../src/lib/comisiones/habitual';

const DAY_MS = 86_400_000;

// Lecturas reales de Odoo (octubre de 2026) congeladas para probar la normalización sin red.
const company = [1, 'INVERSIONES IMPRIMA SAS'];
const cop = [8, 'COP'];
const superpack = [89, 'EMPAQUES Y SERVICIOS SUPERIORES SAS - SUPERPACK'];
const adriana = [11, 'ADRIANA LUCIA ARROYO FUENTES'];
const ZERO_COST_INVOICE = {
  id: 273628, name: 'INIM23327', move_type: 'out_invoice', invoice_date: '2026-10-01', invoice_user_id: adriana,
  commercial_partner_id: superpack, partner_id: superpack, company_id: company, currency_id: cop, company_currency_id: cop,
  amount_untaxed: 235000, amount_untaxed_signed: 235000, margin_signed: 175000, cost_total: 60000, companyCurrencyId: 8,
};
const ZERO_COST_INVOICE_LINE = {
  id: 937143, move_id: [273628, 'INIM23327 (No. OCP-00009873)'], name: '[1900100002] MANTENIMIENTO IMPRESORA TIPO DOS\nIMPRESORA CANON MF 249',
  product_id: [664, '[1900100002] MANTENIMIENTO IMPRESORA TIPO DOS'], product_uom_id: [1, 'Units'], quantity: 1, balance: -160000,
  price_subtotal: 160000, purchase_price: 0, margin: 160000, margin_signed: 160000, sale_line_ids: [257383],
};
const MAINTENANCE_PRODUCT = { id: 664, default_code: '1900100002', categ_id: [67, 'Suministros de Oficina / Mantenimientos,Recargas y  Remanufacturas / Mantenimientos Impresoras'], type: 'service' };
const ZERO_COST_REFUND = {
  id: 273835, name: 'RINV/2026/124', move_type: 'out_refund', invoice_date: '2026-10-02', invoice_user_id: adriana,
  commercial_partner_id: superpack, partner_id: superpack, company_id: company, currency_id: cop, company_currency_id: cop,
  amount_untaxed: 150000, amount_untaxed_signed: -150000, margin_signed: -150000, cost_total: 0, companyCurrencyId: 8,
};
const ZERO_COST_REFUND_LINE = {
  id: 937911, move_id: [273835, 'RINV/2026/124 (Reversión de: INIM23258, NOTA CREDITO [...])'], name: '[2000100002] RENTA IMPRESORA KYOCERA MONOCROMATICA MULTIFUNCIONAL 3145',
  product_id: [1257, '[2000100002] RENTA IMPRESORA KYOCERA MONOCROMATICA MULTIFUNCIONAL'], product_uom_id: [1, 'Units'], quantity: 1, balance: 150000,
  price_subtotal: 150000, purchase_price: 0, margin: 150000, margin_signed: -150000, sale_line_ids: [261035],
};
const RENTAL_PRODUCT = { id: 1257, default_code: '2000100002', categ_id: [93, 'Suministros de Oficina / Renta de equipos / renta de impresoras'], type: 'service' };
const enfragen = [670, 'ENFRAGEN TERMOFLORES S.A.S. E.S.P.'];
const ZERO_COST_GOODS_INVOICE = {
  id: 277477, name: 'INIM23936', move_type: 'out_invoice', invoice_date: '2026-10-28', invoice_user_id: [10, 'GLORIA PATRICIA GOMEZ MONCADA'],
  commercial_partner_id: enfragen, partner_id: enfragen, company_id: company, currency_id: cop, company_currency_id: cop,
  amount_untaxed: 1440000, amount_untaxed_signed: 1440000, margin_signed: 1440000, cost_total: 0, companyCurrencyId: 8,
};
const ZERO_COST_GOODS_LINE = {
  id: 951660, move_id: [277477, 'INIM23936 (OC 75337)'], name: '[1600300183] LOCKER METÁLICO NEO 1 PUESTO GRIS NUBE ALTO 180 CM X 32 CM ANCHO X 30 CM FONDO',
  product_id: [13504, '[1600300183] LOCKER METÁLICO NEO 1 PUESTO GRIS NUBE ALTO 180 CM X 32 CM ANCHO X 30 CM FONDO'], product_uom_id: [1, 'Units'], quantity: 3, balance: -1440000,
  price_subtotal: 1440000, purchase_price: 0, margin: 1440000, margin_signed: 1440000, sale_line_ids: [263452],
};
const LOCKER_PRODUCT = { id: 13504, default_code: '1600300183', categ_id: [51, 'Suministros de Oficina / Mobiliario y Almacenaje / Organizadores'], type: 'consu' };

function zeroCostLines() {
  return [
    normalizeFinancialLine(ZERO_COST_INVOICE, ZERO_COST_INVOICE_LINE, MAINTENANCE_PRODUCT, new Set([26]), new Set(), null),
    normalizeFinancialLine(ZERO_COST_REFUND, ZERO_COST_REFUND_LINE, RENTAL_PRODUCT, new Set([26]), new Set(), null),
    normalizeFinancialLine(ZERO_COST_GOODS_INVOICE, ZERO_COST_GOODS_LINE, LOCKER_PRODUCT, new Set([26]), new Set(), null),
  ];
}

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

test('leads en el portal de gerencia: Dirección y Super Admin, también como rol extra; asesoras y clientes no', () => {
  for (const path of ['/dashboard/leads', '/dashboard/leads/']) {
    assert.equal(canAccessDashboardPath('direccion', path), true);
    assert.equal(canAccessDashboardPath('super_admin', path), true);
    assert.equal(canAccessDashboardPath({ rol: 'asesor', rolesExtra: ['direccion'] }, path), true);
    for (const role of ['asesor', 'comprador', 'aprobador', 'editor_contenido'] as const) assert.equal(canAccessDashboardPath(role, path), false);
  }
  assert.equal(canAccessDashboardPath('editor_contenido', '/admin/leads'), true);
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

test('rangos personalizados: igual número de días inclusivos sin solapamiento', () => {
  const cases: [FinancialRange, FinancialRange][] = [
    [{ from: '2026-09-28', to: '2026-09-28' }, { from: '2026-09-27', to: '2026-09-27' }],
    [{ from: '2026-09-22', to: '2026-09-28' }, { from: '2026-09-15', to: '2026-09-21' }],
    [{ from: '2027-01-02', to: '2027-01-07' }, { from: '2026-12-27', to: '2027-01-01' }],
  ];
  for (const [current, expected] of cases) {
    const previous = previousFinancialRange(current);
    assert.deepEqual(previous, expected);
    assert.equal(inclusiveDays(previous), inclusiveDays(current));
    assert.equal(timestamp(previous.to) + DAY_MS, timestamp(current.from));
    assert.ok(previous.to < current.from);
  }
});

test('los meses completos comparan desde el día uno, incluyendo agosto y años bisiestos', () => {
  for (const [range, previous] of [
    [{ from: '2026-09-01', to: '2026-09-30' }, { from: '2026-08-01', to: '2026-08-31' }],
    [{ from: '2026-08-01', to: '2026-08-31' }, { from: '2026-07-01', to: '2026-07-31' }],
    [{ from: '2028-03-01', to: '2028-03-31' }, { from: '2028-02-01', to: '2028-02-29' }],
    [{ from: '2026-03-01', to: '2026-03-31' }, { from: '2026-02-01', to: '2026-02-28' }],
    [{ from: '2027-01-01', to: '2027-01-31' }, { from: '2026-12-01', to: '2026-12-31' }],
    [{ from: '2026-08-01', to: '2026-09-30' }, { from: '2026-06-01', to: '2026-07-31' }],
  ]) {
    assert.deepEqual(financialComparison(range), { range: previous, mode: 'calendar_months' });
  }
});

test('un mes parcial compara el mismo avance del mes anterior y respeta su último día', () => {
  for (const [range, previous] of [
    [{ from: '2026-10-01', to: '2026-10-21' }, { from: '2026-09-01', to: '2026-09-21' }],
    [{ from: '2026-09-01', to: '2026-09-28' }, { from: '2026-08-01', to: '2026-08-28' }],
    [{ from: '2027-01-01', to: '2027-01-07' }, { from: '2026-12-01', to: '2026-12-07' }],
    [{ from: '2026-03-01', to: '2026-03-30' }, { from: '2026-02-01', to: '2026-02-28' }],
  ]) {
    assert.deepEqual(financialComparison(range), { range: previous, mode: 'month_progress' });
  }
});

test('rango anterior: todos los tamaños autorizados mantienen días UTC exactos', () => {
  const start = timestamp('2028-03-02');
  for (let days = 1; days <= FINANCIAL_MAX_DAYS; days++) {
    const range = { from: '2028-03-02', to: new Date(start + (days - 1) * DAY_MS).toISOString().slice(0, 10) };
    const previous = previousFinancialRange(range);
    assert.equal(inclusiveDays(previous), days);
    assert.equal(timestamp(previous.to) + DAY_MS, start);
  }
});

test('límite inclusivo: acepta 366 días y rechaza 367, incluso en año bisiesto', () => {
  assert.equal(FINANCIAL_MAX_DAYS, 366);
  const range = validateFinancialRange('2028-01-01', '2028-12-31', '2029-01-01');
  assert.equal(inclusiveDays(range), 366);
  assert.deepEqual(previousFinancialRange(range), { from: '2027-01-01', to: '2027-12-31' });
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

test('Soluciones de Empaques y sus subcategorías verificadas liquidan 2% sin cambiar otras categorías', () => {
  assert.equal(PACKAGING_CATEGORY_ID, 132);
  const toner = new Set([26]);
  const packaging = new Set([132, 129, 142, 135, 140, 128, 137, 141, 139, 134]);
  for (const id of packaging) {
    assert.equal(regularCommissionRate(id, toner, packaging), 2);
    assert.equal(regularCommissionKind(id, toner, packaging), 'packaging');
  }
  assert.equal(regularCommissionKind(26, toner, packaging), 'generic_toner');
  for (const id of [1, 18, 25, 27, 77]) {
    assert.equal(regularCommissionRate(id, toner, packaging), 1);
    assert.equal(regularCommissionKind(id, toner, packaging), 'general');
  }
  assert.equal(regularCommissionKind(null, toner, packaging), 'unknown');
  assert.equal(regularCommissionRate(null, toner, packaging), null);
});

test('Empaques paga el mes siguiente sin inventar día de pago y conserva cambio de año', () => {
  assert.equal(nextCommissionMonth('2026-10-23'), '2026-11');
  assert.equal(nextCommissionMonth('2026-12-31'), '2027-01');
  assert.equal(nextCommissionMonth('2028-02-29'), '2028-03');
  assert.deepEqual(regularCommissionPeriod('2026-09', '2026-10-23'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(regularCommissionPeriod('2026-10', '2026-10-23'), { from: '2026-10-01', to: '2026-10-23' });
  assert.throws(() => nextCommissionMonth('2026-02-29'));
  assert.throws(() => regularCommissionPeriod('2026-11', '2026-10-23'));
  assert.throws(() => regularCommissionPeriod('2026-13', '2026-10-23'));
  const empty = summarizeRegularCommissions([]);
  assert.deepEqual(empty.map(row => [row.kind, row.rate]), [['general', 1], ['low_margin', 0.5], ['generic_toner', 2], ['packaging', 2], ['unknown', null]]);
  assert.ok(empty.every(row => row.commission === 0 && row.netSales === 0 && row.lineCount === 0));
});
test('aritmética de comisión: base neta al 0,5%, 1% o 2% sin sumar el bono separado del 0,5%', () => {
  assert.equal(PLATFORM_BONUS_PERCENT, 0.5);
  assert.equal(calculateRegularCommission(100, 0.5), 0.5);
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

test('comisión: rechaza bases no finitas y tasas distintas de las tres autorizadas', () => {
  for (const base of [NaN, Infinity, -Infinity]) {
    for (const rate of [0.5, 1, 2, null]) assert.throws(() => calculateRegularCommission(base, rate), /base/);
  }
  for (const rate of [0, 0.25, 1.5, 2.5, -1, 100, NaN, Infinity]) {
    assert.throws(() => calculateRegularCommission(100, rate), /0,5%, 1% o 2%/);
  }
});

test('margen menor al 15% en líneas reales de octubre: general comisiona 0,5%, tóner genérico conserva 2% y sin costo queda pendiente', () => {
  const company = [1, 'INVERSIONES IMPRIMA SAS'];
  const cop = [8, 'COP'];
  const safeInvoice = {
    id: 273872, name: 'INIM23422', move_type: 'out_invoice', invoice_date: '2026-10-02', invoice_user_id: [11, 'ADRIANA LUCIA ARROYO FUENTES'],
    commercial_partner_id: [18, 'ELECTRICAS DE MEDELLIN - INGENIERIA Y SERVICIOS SAS'], partner_id: [18, 'ELECTRICAS DE MEDELLIN - INGENIERIA Y SERVICIOS SAS'],
    company_id: company, currency_id: cop, company_currency_id: cop, amount_untaxed: 14800000, amount_untaxed_signed: 14800000, margin_signed: 1778628, cost_total: 13021372, companyCurrencyId: 8,
  };
  const safeLine = {
    id: 938082, move_id: [273872, 'INIM23422'], name: '[1600400497] CAJA FUERTE SUPER BLINDADA CON CERRADURA DIGITAL 89X50X50 CM',
    product_id: [13472, '[1600400497] CAJA FUERTE SUPER BLINDADA CON CERRADURA DIGITAL 89X50X50 CM'], product_uom_id: [1, 'Units'], quantity: 1, balance: -14800000,
    price_subtotal: 14800000, purchase_price: 13021372, margin: 1778628, margin_signed: 1778628, sale_line_ids: [262364],
  };
  const safeProduct = { id: 13472, default_code: '1600400497', categ_id: [52, 'Suministros de Oficina / Mobiliario y Almacenaje / Amoblamiento y Dotación'], type: 'consu' };
  const tonerInvoice = {
    id: 276947, name: 'INIM23860', move_type: 'out_invoice', invoice_date: '2026-10-22', invoice_user_id: [10, 'GLORIA PATRICIA GOMEZ MONCADA'],
    commercial_partner_id: [78, 'SUPER MERCADO BOOM S.A.S.'], partner_id: [78, 'SUPER MERCADO BOOM S.A.S.'],
    company_id: company, currency_id: cop, company_currency_id: cop, amount_untaxed: 227800, amount_untaxed_signed: 227800, margin_signed: 78521, cost_total: 149279, companyCurrencyId: 8,
  };
  const tonerLine = {
    id: 949874, move_id: [276947, 'INIM23860'], name: '[1300200002] TONER GENERICO STONER HPCF280X/CE505X', product_id: [408, '[1300200002] TONER GENERICO STONER HPCF280X/CE505X'],
    product_uom_id: [1, 'Units'], quantity: 3, balance: -105000, price_subtotal: 105000, purchase_price: 31093, margin: 11721, margin_signed: 11721, sale_line_ids: [264749],
  };
  const tonerProduct = { id: 408, default_code: '1300200002', categ_id: [26, 'Suministros de Oficina / Suministros de impresión / Toner genéricos'], type: 'consu' };
  const safe = normalizeFinancialLine(safeInvoice, safeLine, safeProduct, new Set([26]), new Set(), null);
  assert.equal(safe.marginPercent, 12.02);
  assert.deepEqual([safe.commissionKind, safe.commissionRate, safe.commission], ['low_margin', 0.5, 74000]);
  const toner = normalizeFinancialLine(tonerInvoice, tonerLine, tonerProduct, new Set([26]), new Set(), null);
  assert.equal(toner.marginPercent, 11.16);
  assert.deepEqual([toner.commissionKind, toner.commissionRate, toner.commission], ['generic_toner', 2, 2100]);
  const pending = normalizeFinancialLine(safeInvoice, { ...safeLine, purchase_price: false }, safeProduct, new Set([26]), new Set(), null);
  assert.deepEqual([pending.commissionKind, pending.commissionRate, pending.commission], ['general', null, null]);
  assert.ok(pending.issues.includes(PENDING_MARGIN_COMMISSION_ISSUE));
  assert.deepEqual(lineCommissionRule('general', -187000, -39105), { kind: 'general', rate: 1 });
  assert.deepEqual(lineCommissionRule('general', -100000, -14990), { kind: 'low_margin', rate: 0.5 });
  assert.deepEqual(lineCommissionRule('general', 100000, 15000), { kind: 'general', rate: 1 });
  const breakdown = summarizeRegularCommissions([safe, toner]);
  assert.deepEqual(breakdown.filter(row => row.lineCount).map(row => [row.kind, row.netSales, row.commission]), [['low_margin', 14800000, 74000], ['generic_toner', 105000, 2100]]);
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
    verifiedSales: 0, unverifiedSales: 0, verifiedMarginPercent: null, missingCostInvoices: 0,
    marginPercent: null, costCoveragePercent: null, missingCostLines: 0,
    commission: 0, knownCommission: 0, missingCommissionLines: 0, averageInvoice: null,
  });
  assert.deepEqual(filterFinancialLines([], { advisorId: null, page: 1 }), []);
});

test('costo cero real de Odoo: servicios aceptados con costo cero y mercancía señalada, ambos con la utilidad de Odoo', () => {
  const [invoiceLine, refundLine, goodsLine] = zeroCostLines();
  assert.equal(invoiceLine.netSales, 160000);
  assert.equal(invoiceLine.cost, 0);
  assert.equal(invoiceLine.unitCost, 0);
  assert.equal(invoiceLine.profit, ZERO_COST_INVOICE_LINE.margin_signed);
  assert.equal(invoiceLine.marginPercent, 100);
  assert.equal(refundLine.netSales, -150000);
  assert.equal(refundLine.quantity, -1);
  assert.equal(refundLine.cost, 0);
  assert.equal(refundLine.profit, ZERO_COST_REFUND_LINE.margin_signed);
  assert.equal(refundLine.marginPercent, null);
  for (const line of [invoiceLine, refundLine]) {
    assert.equal(line.isService, true);
    assert.equal(line.issues.includes(ZERO_RECORDED_COST_ISSUE), false);
    assert.equal(hasZeroRecordedCost(line), true);
    assert.equal(isZeroCostService(line), true);
    assert.equal(needsCostReview(line), false);
  }
  assert.equal(goodsLine.isService, false);
  assert.equal(goodsLine.cost, 0);
  assert.equal(goodsLine.profit, ZERO_COST_GOODS_LINE.margin_signed);
  assert.ok(goodsLine.issues.includes(ZERO_RECORDED_COST_ISSUE));
  assert.equal(isZeroCostService(goodsLine), false);
  assert.equal(needsCostReview(goodsLine), true);
  const totals = summarizeFinancialLines([invoiceLine, refundLine, goodsLine]);
  assert.equal(totals.netSales, 1450000);
  assert.equal(totals.cost, 0);
  assert.equal(totals.profit, 1450000);
  assert.equal(totals.verifiedProfit, 1450000);
  assert.equal(totals.missingCostLines, 0);
  assert.equal(totals.unverifiedSales, 0);
  assert.equal(totals.costCoveragePercent, 100);
  const report = buildFinancialReport([invoiceLine, refundLine, goodsLine], { from: '2026-10-01', to: '2026-10-28' }, { page: 1 }, '2026-11-04T12:00:00Z');
  assert.deepEqual(report.totals, totals);
  assert.equal(report.costReview.zeroCostGoodsLines, 1);
  assert.equal(report.costReview.zeroCostGoodsInvoices, 1);
  assert.equal(report.costReview.zeroCostGoodsSales, 1440000);
  assert.equal(report.costReview.zeroCostServiceLines, 2);
  assert.equal(report.costReview.zeroCostServiceSales, 10000);
});

test('costo ausente, negativo o con cantidad cero sigue pendiente y no se toma como costo cero', () => {
  for (const changes of [{ purchase_price: false }, { purchase_price: -1 }, { quantity: 0 }]) {
    const line = normalizeFinancialLine(ZERO_COST_INVOICE, { ...ZERO_COST_INVOICE_LINE, ...changes }, MAINTENANCE_PRODUCT, new Set([26]), new Set(), null);
    assert.equal(line.cost, null, JSON.stringify(changes));
    assert.equal(line.profit, null);
    assert.equal(line.issues.includes(ZERO_RECORDED_COST_ISSUE), false);
    assert.equal(hasZeroRecordedCost(line), false);
    assert.equal(needsCostReview(line), true);
    const totals = summarizeFinancialLines([line]);
    assert.equal(totals.profit, null);
    assert.equal(totals.missingCostLines, 1);
    const report = buildFinancialReport([line], { from: '2026-10-01', to: '2026-10-01' }, { page: 1, onlyMissingCost: true }, '2026-11-04T12:00:00Z');
    assert.equal(report.costReview.zeroCostGoodsLines, 0);
    assert.equal(report.costReview.zeroCostServiceLines, 0);
    assert.deepEqual(report.costReview.products.map(group => [group.lineCount, group.missingCostLines]), [[1, 1]]);
    assert.equal(report.pagination.total, 1);
  }
});

test('el filtro de revisión lista solo mercancía con costo cero y pendientes, sin servicios ni cambios en los KPI', () => {
  const lines = zeroCostLines();
  const range = { from: '2026-10-01', to: '2026-10-28' };
  const all = buildFinancialReport(lines, range, { page: 1 }, '2026-11-04T12:00:00Z');
  const review = buildFinancialReport(lines, range, { page: 1, onlyMissingCost: true }, '2026-11-04T12:00:00Z');
  assert.deepEqual(review.totals, all.totals);
  assert.deepEqual(review.costReview, all.costReview);
  assert.deepEqual(review.lines.map(line => line.id), [951660]);
  assert.equal(review.pagination.total, 1);
  assert.deepEqual(review.costReview.products.map(group => [group.id, group.categoryName, group.lineCount - group.missingCostLines, group.missingCostLines, group.netSales]), [
    [13504, LOCKER_PRODUCT.categ_id[1], 1, 0, 1440000],
  ]);
  assert.ok(all.products.every(group => !('categoryName' in group)), 'El resumen general de productos no agrega categorías para no crecer la respuesta.');
});

test('rangos largos agrupan la evolución por mes y la respuesta compacta se reconstruye sin perder datos', () => {
  const lines = zeroCostLines();
  const daily = buildFinancialReport(lines, { from: '2026-10-01', to: '2026-10-28' }, { page: 1 }, '2026-11-04T12:00:00Z');
  assert.equal(daily.trendGranularity, 'day');
  assert.deepEqual(daily.trend.map(point => point.date), ['2026-10-01', '2026-10-02', '2026-10-28']);
  const annual = buildFinancialReport(lines, { from: '2025-11-03', to: '2026-11-03' }, { page: 1 }, '2026-11-04T12:00:00Z', ['Fuente real']);
  assert.equal(annual.trendGranularity, 'month');
  assert.deepEqual(annual.trend, [{ date: '2026-10', netSales: 1450000, profit: 1450000, commission: annual.totals.commission }]);
  for (const report of [daily, annual]) {
    const wire = JSON.parse(JSON.stringify(encodeFinancialReport(report)));
    assert.deepEqual(decodeFinancialReport(wire), JSON.parse(JSON.stringify(report)));
    assert.ok(JSON.stringify(wire.products).length < JSON.stringify(report.products).length);
  }
  assert.throws(() => decodeFinancialReport({ ...encodeFinancialReport(annual), products: { fields: ['key'], rows: [['a', 'b']] } }), /reporte válido/);
});

test('cartera como el tablero de Odoo: totales reales del 2026-11-04 por diario y puente exacto al saldo contable', () => {
  const journal = (side: OpenInvoiceDocument['side'], id: number, name: string, total: number, residual: number, creditNoteJournal = false): OpenInvoiceDocument => ({
    id, side, journalId: id, journalName: name, creditNoteJournal, total, residual,
  });
  const documents = [
    journal('receivable', 1, 'Facturas de cliente Electronica', 897365461.25, 889163957.25),
    journal('receivable', 56, 'Nota Crédito Electronica', -174692, -174692, true),
    journal('payable', 2, 'Facturas Compra', 418997687.88, 417299967.6),
    journal('payable', 22, 'Gasto', 35232409.29, 35232409.29),
    journal('payable', 58, 'DOC SOPORTE', 4620411.3, 4620411.3),
    journal('payable', 21, 'DOC SOPORTE (ARCHIVADO)', 1778390.16, 1778390.16),
    journal('payable', 59, 'Nota Crédito Proveedores', -2774413.88, -2774413.88, true),
  ];
  const receivable = summarizeOpenInvoices(documents, 'receivable', roundCurrency(1016602317.13 - 169057255));
  assert.equal(Math.round(receivable.total), 897365461);
  assert.equal(receivable.partialPayments, -8201504);
  assert.equal(receivable.creditNoteResidual, -174692);
  assert.equal(receivable.otherOpen, -41444203.12);
  assert.deepEqual([receivable.journals, receivable.creditNoteJournals], [['Facturas de cliente Electronica'], ['Nota Crédito Electronica']]);
  const payable = summarizeOpenInvoices(documents, 'payable', 450590905.04);
  assert.equal(payable.total, 460628898.63);
  assert.equal(payable.residual, 458931178.35);
  assert.equal(payable.otherOpen, -5565859.43);
  for (const summary of [receivable, payable]) {
    assert.equal(roundCurrency(summary.total + summary.partialPayments + summary.creditNoteResidual + summary.otherOpen), summary.accountingBalance);
  }
  const report = buildOpenBalanceReport([], '2026-11-04', '2026-11-04T17:00:00Z', { side: 'receivable', status: 'all', search: '', page: 1 }, { id: 1, name: 'INVERSIONES IMPRIMA SAS' }, {
    invoices: documents, writtenOff: { documents: ['I/2025/12/0487'], lineCount: 3, balance: 169057255 },
  });
  assert.equal(report.invoices?.receivable.accountingBalance, report.receivable.balance);
  assert.deepEqual(report.writtenOff, { documents: ['I/2025/12/0487'], lineCount: 3, balance: 169057255 });
  assert.ok(report.warnings.some(warning => warning.includes('I/2025/12/0487')));
  assert.equal(buildOpenBalanceReport([], '2026-11-04', '2026-11-04T17:00:00Z', { side: 'receivable', status: 'all', search: '', page: 1 }).invoices, null);
});

test('cartera: el vencimiento empieza al día siguiente y una fecha ausente no se inventa', () => {
  assert.equal(overdueDays('2026-12-04', '2026-10-21'), 0);
  assert.equal(overdueDays('2026-12-04', '2026-12-04'), 0);
  assert.equal(overdueDays('2026-12-04', '2026-12-05'), 1);
  assert.equal(overdueDays(null, '2026-10-21'), null);
  assert.equal(overdueDays('2028-02-29', '2028-03-01'), 1);
  assert.throws(() => overdueDays('2026-02-29', '2026-10-21'));
  const totals = summarizeOpenBalances([]);
  assert.deepEqual(totals.accounts, []);
  assert.equal(totals.balance, 0);
  assert.equal(totals.documentCount, 0);
  assert.equal(totals.partnerCount, 0);
  assert.ok(totals.aging.every(bucket => bucket.amount === 0));
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
  assert.deepEqual(report.costReview, { zeroCostGoodsLines: 0, zeroCostGoodsInvoices: 0, zeroCostGoodsSales: 0, zeroCostServiceLines: 0, zeroCostServiceSales: 0, products: [] });
  assert.equal(report.trendGranularity, 'day');
  assert.equal(report.currency, 'COP');
  assert.equal(report.generatedAt, generatedAt);
  assert.equal(FINANCIAL_PAGE_SIZE, 100);
  assert.deepEqual(report.pagination, { page: 1, pageSize: 100, total: 0, totalPages: 1 });
  assert.equal(report.filters.page, 1);
  assert.deepEqual(report.warnings, ['Consulta sin documentos']);
  assert.equal(warnings.length, 2);
});

test('rol Cartera: solo cuentas por cobrar y pedidos; sin gerencia, comisiones, leads, compras ni por pagar', () => {
  for (const path of ['/dashboard', '/dashboard/cartera', '/dashboard/perfil']) assert.equal(canAccessDashboardPath('cartera', path), true);
  for (const path of ['/dashboard/pedidos', '/dashboard/gerencia', '/dashboard/comisiones', '/dashboard/leads', '/admin/leads', '/dashboard/compras', '/dashboard/catalogo', '/dashboard/clientes']) {
    assert.equal(canAccessDashboardPath('cartera', path), false, path);
  }
  assert.equal(canAccessDashboardPath('direccion', '/dashboard/cartera'), true);
  const invoices: OpenInvoiceDocument[] = [
    { id: 1, side: 'receivable', journalId: 1, journalName: 'Facturas de cliente Electronica', creditNoteJournal: false, total: 897365461.25, residual: 889163957.25 },
    { id: 2, side: 'payable', journalId: 2, journalName: 'Facturas Compra', creditNoteJournal: false, total: 418997687.88, residual: 417299967.6 },
  ];
  const filters = { side: 'receivable' as const, status: 'all' as const, search: '', page: 1 };
  const limited = receivableOnlyReport(buildOpenBalanceReport([], '2026-11-11', '2026-11-11T15:00:00Z', filters, { id: 1, name: 'INVERSIONES IMPRIMA SAS' }, { invoices }));
  assert.equal(limited.invoices?.receivable.total, 897365461.25);
  assert.deepEqual([limited.invoices?.payable.total, limited.invoices?.payable.documentCount, limited.invoices?.payable.journals, limited.payable.balance, limited.payable.lineCount], [0, 0, [], 0, 0]);
  assert.throws(() => receivableOnlyReport(buildOpenBalanceReport([], '2026-11-11', '2026-11-11T15:00:00Z', { ...filters, side: 'payable' })));
});
