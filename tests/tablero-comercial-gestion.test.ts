import assert from 'node:assert/strict';
import test from 'node:test';
import { isRecovered, valueSince } from '../src/lib/comercial/tablero';

// Fechas reales de compra de SUPER MERCADO BOOM (cliente 78 en Odoo), jul-ago 2026.
test('gestión: la alerta se cierra sola y cuenta como recuperado cuando el cliente vuelve a comprar', () => {
  assert.equal(isRecovered('2026-08-06', '2026-07-16'), true);
  assert.equal(isRecovered('2026-07-16', '2026-07-16'), false);
  assert.equal(isRecovered(null, '2026-07-16'), false);
  assert.equal(isRecovered('2026-08-06', null), false);
});

test('gestión: el valor recuperado suma solo lo comprado después de la gestión', () => {
  // Facturas reales (sin IVA) de SUPER MERCADO BOOM por día en Odoo.
  const days: [string, number][] = [['2026-07-10', 277_600], ['2026-07-16', 99_800], ['2026-08-06', 322_000]];
  assert.equal(valueSince(days, '2026-07-10'), 421_800);
  assert.equal(valueSince(days, '2026-07-16'), 322_000);
  assert.equal(valueSince(new Map(days), '2026-08-06'), 0);
});
