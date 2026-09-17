import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { parseAdminLeadQuery } from '../src/lib/leads-query';
import { userHasAnyRole } from '../src/lib/auth/roles';

const query = (values: Record<string, string>) => new URLSearchParams(values);

test('el detalle consulta un único UUID y no hereda el desplazamiento de la lista', () => {
  const id = randomUUID();
  assert.deepEqual(parseAdminLeadQuery(query({ id: id.toUpperCase(), limit: '100', offset: '50' })), { leadId: id, limit: 1, offset: 0 });
});

test('un identificador vacío o mal formado no se convierte en una consulta de todos los leads', () => {
  for (const id of ['', 'no-es-uuid', '../', '-'.repeat(36), `${randomUUID()}\n`, ` ${randomUUID()}`, `${randomUUID()},${randomUUID()}`]) {
    assert.throws(() => parseAdminLeadQuery(query({ id })), /identificador/);
  }
});

test('el listado conserva sus valores predeterminados y limita el tamaño por página', () => {
  assert.deepEqual(parseAdminLeadQuery(query({})), { leadId: null, limit: 50, offset: 0 });
  assert.deepEqual(parseAdminLeadQuery(query({ limit: '200', offset: '100' })), { leadId: null, limit: 100, offset: 100 });
  for (const limit of ['0', '-1', '1.5', 'abc', 'Infinity']) assert.throws(() => parseAdminLeadQuery(query({ limit })), /paginación/);
  for (const offset of ['-1', '0.5', 'abc', 'Infinity']) assert.throws(() => parseAdminLeadQuery(query({ offset })), /paginación/);
});

test('la capacidad de gestionar leads incluye Editor como rol extra y no el rol comercial por sí solo', () => {
  const allowed = ['super_admin', 'direccion', 'editor_contenido'] as const;
  assert.equal(userHasAnyRole({ rol: 'asesor', rolesExtra: ['editor_contenido'] }, allowed), true);
  assert.equal(userHasAnyRole({ rol: 'asesor', rolesExtra: [] }, allowed), false);
  assert.equal(userHasAnyRole({ rol: 'comprador', rolesExtra: [] }, allowed), false);
  assert.equal(userHasAnyRole({ rol: 'direccion', rolesExtra: [] }, allowed), true);
});
