import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuotationNote,
  computePedidoTotals,
  resolveEstadoAlEnviarBorrador,
} from '../src/lib/pedidos/aprobacion.server';

test('enviar un borrador replica la decisión del trigger de INSERT según requiere_aprobacion', () => {
  assert.equal(resolveEstadoAlEnviarBorrador(false), 'aprobado');
  assert.equal(resolveEstadoAlEnviarBorrador(true), 'en_aprobacion');
  assert.equal(resolveEstadoAlEnviarBorrador(null), 'en_aprobacion');
  assert.equal(resolveEstadoAlEnviarBorrador(undefined), 'en_aprobacion');
});

test('los totales del pedido siguen a los precios reprecificados de los ítems', () => {
  assert.deepEqual(
    computePedidoTotals([
      { cantidad: 2, precio_unitario_cop: 2635 },
      { cantidad: 10, precio_unitario_cop: 9132 },
      { cantidad: 1, precio_unitario_cop: 0 },
    ]),
    { total_items: 13, valor_total_cop: 96590 },
  );
  assert.deepEqual(computePedidoTotals([]), { total_items: 0, valor_total_cop: 0 });
});

test('la nota de la cotización conserva sede y comentarios sin líneas vacías', () => {
  assert.equal(
    buildQuotationNote({
      numero: 'PED-2026-0053',
      sede: { id: 's1', nombre_sede: 'Principal', direccion: 'Cra 50 FF 8 Sur 27', ciudad: null, odoo_address_id: null },
      comentarios_sede: '  ',
      comentarios_aprobador: null,
    }),
    'Pedido B2B PED-2026-0053\nSede: Principal\nDirección: Cra 50 FF 8 Sur 27',
  );
  assert.equal(
    buildQuotationNote({ numero: 'PED-2026-0054', sede: null, comentarios_sede: 'Entregar en portería', comentarios_aprobador: null }),
    'Pedido B2B PED-2026-0054\nComentarios sede: Entregar en portería',
  );
});
