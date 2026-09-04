import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePlatformBonus,
  getBogotaCalendarDate,
  getCommissionPeriodRange,
  getInvoiceLineBase,
  roundCurrency,
  summarizePlatformBonus,
} from '../src/lib/comisiones/bonoPlataforma';
import { canAccessDashboardPath } from '../src/lib/auth/routeAccess';

test('el periodo incluye todo septiembre y rechaza fechas anteriores a la vigencia', () => {
  assert.deepEqual(getCommissionPeriodRange('2026-09'), {
    period: '2026-09', periodDate: '2026-09-01', startDate: '2026-09-01', endDate: '2026-09-30',
  });
  assert.equal(getCommissionPeriodRange('2028-02').endDate, '2028-02-29');
  for (const period of ['2026-08', '2026-13', '2026-00', '2026-9', '', '2026-09-01']) {
    assert.throws(() => getCommissionPeriodRange(period));
  }
});

test('el corte de mes respeta medianoche de Colombia', () => {
  assert.equal(getBogotaCalendarDate(new Date('2026-10-01T04:59:59Z')), '2026-09-30');
  assert.equal(getBogotaCalendarDate(new Date('2026-10-01T05:00:00Z')), '2026-10-01');
});

test('el bono es 0,5% independiente y simétrico para ajustes contables', () => {
  assert.equal(calculatePlatformBonus(479000), 2395);
  assert.equal(calculatePlatformBonus(3475510), 17377.55);
  assert.equal(calculatePlatformBonus(-479000), -2395);
  assert.equal(calculatePlatformBonus(0), 0);
  assert.throws(() => calculatePlatformBonus(Number.NaN));
  assert.throws(() => calculatePlatformBonus(479000, Number.POSITIVE_INFINITY));
});

test('el saldo contable conserva descuentos en vez de volverlos ingresos', () => {
  assert.equal(getInvoiceLineBase(-479000), 479000);
  assert.equal(getInvoiceLineBase(479000), -479000);
  assert.equal(getInvoiceLineBase(0), 0);
  for (const invalid of [null, undefined, false, '479000', Number.NaN, Infinity]) {
    assert.throws(() => getInvoiceLineBase(invalid));
  }
});

test('redondeo monetario simétrico con dos decimales', () => {
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundCurrency(-1.005), -1.01);
  assert.equal(roundCurrency(10.075), 10.08);
  assert.equal(roundCurrency(-10.075), -10.08);
  assert.equal(roundCurrency(-0.0001), 0);
  assert.throws(() => roundCurrency(Infinity));
});

test('sin datos financieros el resumen no inventa bonos ni clientes', () => {
  assert.deepEqual(summarizePlatformBonus([], []), {
    clients: [],
    totals: { activeClients: 0, invoiceCount: 0, creditNoteCount: 0, invoicedBase: 0, creditNotes: 0, netBase: 0, bonus: 0 },
  });
});

test('la navegación solo permite capacidades comerciales autorizadas', () => {
  for (const role of ['asesor', 'direccion', 'super_admin'] as const) {
    assert.equal(canAccessDashboardPath(role, '/dashboard/comisiones'), true);
  }
  for (const role of ['comprador', 'aprobador', 'editor_contenido'] as const) {
    assert.equal(canAccessDashboardPath(role, '/dashboard/comisiones'), false);
  }
});
