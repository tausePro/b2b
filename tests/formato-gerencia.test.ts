import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMoneyShort, formatMonthShort, shortPersonName, toDisplayName } from '../src/lib/gerencia/formato';

test('formato de gerencia: nombres de Odoo legibles y cortos, millones y meses como en la propuesta', () => {
  assert.equal(toDisplayName('GLORIA PATRICIA GOMEZ MONCADA'), 'Gloria Patricia Gomez Moncada');
  assert.equal(toDisplayName('VANESA PATIÑO GALVIS'), 'Vanesa Patiño Galvis');
  assert.equal(toDisplayName('Carolina Arias'), 'Carolina Arias');
  assert.equal(shortPersonName('GLORIA PATRICIA GOMEZ MONCADA'), 'Gloria Gomez');
  assert.equal(shortPersonName('VANESA PATIÑO GALVIS'), 'Vanesa Patiño');
  assert.equal(shortPersonName('DORA RODRIGUEZ'), 'Dora Rodriguez');
  assert.equal(formatMoneyShort(216363701.85).replace(/\s/g, ' '), '$ 216,4 M');
  assert.equal(formatMoneyShort(342000).replace(/\s/g, ' '), '$ 342.000');
  assert.equal(formatMonthShort('2026-10', '2026'), 'oct');
  assert.equal(formatMonthShort('2025-11', '2026'), 'nov 25');
});
