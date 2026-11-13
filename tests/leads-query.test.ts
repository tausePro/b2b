import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { parseAdminLeadQuery } from '../src/lib/leads-query';
import { userHasAnyRole } from '../src/lib/auth/roles';

const query = (values: Record<string, string>) => new URLSearchParams(values);

test('el detalle consulta un único UUID y no hereda el desplazamiento de la lista', () => {
  const id = randomUUID();
  assert.deepEqual(parseAdminLeadQuery(query({ id: id.toUpperCase(), limit: '100', offset: '50', desde: '2026-09-13T20:00:00.000Z' })), { leadId: id, limit: 1, offset: 0, since: null });
});

test('un identificador vacío o mal formado no se convierte en una consulta de todos los leads', () => {
  for (const id of ['', 'no-es-uuid', '../', '-'.repeat(36), `${randomUUID()}\n`, ` ${randomUUID()}`, `${randomUUID()},${randomUUID()}`]) {
    assert.throws(() => parseAdminLeadQuery(query({ id })), /identificador/);
  }
});

test('el listado conserva sus valores predeterminados y limita el tamaño por página', () => {
  assert.deepEqual(parseAdminLeadQuery(query({})), { leadId: null, limit: 50, offset: 0, since: null });
  assert.deepEqual(parseAdminLeadQuery(query({ limit: '200', offset: '100' })), { leadId: null, limit: 200, offset: 100, since: null });
  assert.equal(parseAdminLeadQuery(query({ limit: '900' })).limit, 500);
  assert.equal(parseAdminLeadQuery(query({ desde: '2026-09-13T20:00:00.000Z' })).since, '2026-09-13T20:00:00.000Z');
  for (const desde of ['ayer', '2026-13-45', '2026-09-13 20:00', "2026-09-13T00:00:00Z' OR 1=1"]) assert.throws(() => parseAdminLeadQuery(query({ desde })), /fecha/);
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
