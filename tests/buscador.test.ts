import assert from 'node:assert/strict';
import test from 'node:test';
import { matchMenuItems, normalizeSearchText, sanitizeSearchQuery } from '../src/lib/busqueda/buscar';
import { buildMenuGroups } from '../src/lib/navigation/menu';

test('buscador ⌘K: compara sin tildes ni mayúsculas y quita comodines de SQL', () => {
  assert.equal(normalizeSearchText('  Analítica   VENTAS '), 'analitica ventas');
  assert.equal(sanitizeSearchQuery(' 100%_ARIS\\ '), '100 ARIS');
  assert.equal(sanitizeSearchQuery('x'.repeat(200)).length, 80);
});

test('buscador ⌘K: opciones del menú según el rol, primero las que empiezan por el texto', () => {
  const direccion = buildMenuGroups(['direccion']);
  assert.deepEqual(matchMenuItems(direccion, 'car').map(item => item.label), ['Cartera']);
  assert.deepEqual(matchMenuItems(direccion, 'analitica').map(item => item.href), ['/dashboard/analitica']);
  assert.deepEqual(matchMenuItems(direccion, 'pedidos').map(item => item.label), ['Pedidos', 'Informes Pedidos']);
  assert.equal(matchMenuItems(direccion, 'comercial').every(item => item.group === 'Comercial'), true);
  assert.equal(matchMenuItems(direccion, '').length, 6);
  assert.deepEqual(matchMenuItems(buildMenuGroups(['cartera']), 'leads'), []);
});
