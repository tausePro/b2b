import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LeadValidationError, isLeadHoneypotFilled, normalizeLeadPhone, normalizeLeadSource, validateLeadContact, validateLeadName,
} from '../src/lib/leads/validation';

const field = (fn: () => unknown) => {
  try { fn(); } catch (error) { if (error instanceof LeadValidationError) return error.field; throw error; }
  assert.fail('Se esperaba un error de validación');
};

test('rechaza nombres sin letras reales como el lead ".o"', () => {
  for (const nombre of ['.o', 'o', '..', '12', 'aaaa', '  ', 'Juan123', 'http://spam', '@@']) {
    assert.equal(field(() => validateLeadName(nombre)), 'nombre', nombre);
  }
  for (const nombre of ['María José Pérez', "D'Angelo Ruiz", 'Ana-María', 'Ñoño Gómez', 'Jo']) {
    assert.equal(validateLeadName(`  ${nombre}  `), nombre);
  }
});

test('exige al menos un correo o teléfono, y que lo informado sea válido', () => {
  assert.equal(field(() => validateLeadContact({ nombre: 'Ana Gómez', mensaje: 'Estoy interesado en soluciones de empaque para mi empresa.' })), 'contacto');
  assert.equal(field(() => validateLeadContact({ nombre: 'Ana Gómez', email: 'ana@', telefono: '3001234567' })), 'email');
  assert.equal(field(() => validateLeadContact({ nombre: 'Ana Gómez', email: 'ana@empresa.co', telefono: '12345' })), 'telefono');
  assert.deepEqual(validateLeadContact({ nombre: 'Ana Gómez', email: ' ANA@Empresa.CO ', telefono: '' }), {
    nombre: 'Ana Gómez', empresa: null, email: 'ana@empresa.co', telefono: null, mensaje: null,
  });
});

test('normaliza teléfonos colombianos e internacionales a E.164', () => {
  assert.equal(normalizeLeadPhone('300 123 4567'), '+573001234567');
  assert.equal(normalizeLeadPhone('+57 (311) 784-8432'), '+573117848432');
  assert.equal(normalizeLeadPhone('573117848432'), '+573117848432');
  assert.equal(normalizeLeadPhone('601 234 5678'), '+576012345678');
  assert.equal(normalizeLeadPhone('+1 305 555 0182'), '+13055550182');
  for (const telefono of ['123456789', '3000000000', '3111111111', '2001234567', '+00 123', '300-ABC-1234', '+1 2']) {
    assert.equal(field(() => normalizeLeadPhone(telefono)), 'telefono', telefono);
  }
});

test('limita tamaños, enlaces en empresa y mensajes con varios enlaces', () => {
  const base = { nombre: 'Ana Gómez', telefono: '3001234567' };
  assert.equal(field(() => validateLeadContact({ ...base, empresa: 'x'.repeat(161) })), 'empresa');
  assert.equal(field(() => validateLeadContact({ ...base, empresa: 'www.promo.ru' })), 'empresa');
  assert.equal(field(() => validateLeadContact({ ...base, mensaje: 'https://a.com y https://b.ru' })), 'mensaje');
  assert.equal(field(() => validateLeadContact({ ...base, mensaje: 'x'.repeat(2001) })), 'mensaje');
  assert.equal(validateLeadContact({ ...base, empresa: 'Prexxa SAS', mensaje: 'Ver ficha en https://empaques.imprima.com.co\nGracias' }).mensaje,
    'Ver ficha en https://empaques.imprima.com.co\nGracias');
});

test('fuente y trampa antispam', () => {
  assert.equal(normalizeLeadSource('empaques_hero'), 'empaques_hero');
  assert.equal(normalizeLeadSource('producto_3787'), 'producto_3787');
  for (const fuente of [undefined, '', 'DROP TABLE', 'a'.repeat(81), 5]) assert.equal(normalizeLeadSource(fuente), 'landing');
  assert.equal(isLeadHoneypotFilled({ sitio_web: 'https://bot.example' }), true);
  assert.equal(isLeadHoneypotFilled({ sitio_web: '' }), false);
  assert.equal(isLeadHoneypotFilled({}), false);
});
