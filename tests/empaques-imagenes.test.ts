import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPAQUES_PRODUCT_IMAGE_PX,
  buildEmpaquesProductImageUrl,
  getBase64Mime,
  getEmpaquesInlineImageSrc,
  getEmpaquesProductImageSrc,
  hasOdooBinary,
  parseEmpaquesImageSize,
  toEmpaquesImageVersion,
} from '../src/lib/empaques/product-images';

test('bin_size de Odoo indica si el producto tiene imagen sin traer el base64', () => {
  assert.equal(hasOdooBinary('30.17 Kb'), true);
  assert.equal(hasOdooBinary('/9j/4AAQSkZJRg=='), true);
  assert.equal(hasOdooBinary(false), false);
  assert.equal(hasOdooBinary(''), false);
  assert.equal(hasOdooBinary(undefined), false);
});

test('la versión de imagen deriva de write_date y no depende de la zona horaria', () => {
  assert.equal(toEmpaquesImageVersion('2026-08-19 00:22:51'), '20260819002251');
  assert.equal(toEmpaquesImageVersion(false), null);
  assert.equal(toEmpaquesImageVersion(undefined), null);
});

test('las tarjetas y el detalle piden a Odoo una resolución suficiente para pantallas retina', () => {
  assert.equal(EMPAQUES_PRODUCT_IMAGE_PX.card, 1024);
  assert.equal(EMPAQUES_PRODUCT_IMAGE_PX.detail, 1920);
  assert.equal(
    buildEmpaquesProductImageUrl(9326, 1024, '20260819002251'),
    '/api/empaques/imagen/9326?s=1024&v=20260819002251',
  );
  assert.equal(buildEmpaquesProductImageUrl(9326, 1920, null), '/api/empaques/imagen/9326?s=1920');
});

test('la imagen editorial publicada tiene prioridad sobre la fotografía de Odoo', () => {
  const product = { id: 9326, image_url: ' https://cdn.example.com/caja.png ', has_image: true, image_version: '20260819002251' };
  assert.equal(getEmpaquesProductImageSrc(product), 'https://cdn.example.com/caja.png');
  assert.equal(getEmpaquesProductImageSrc(product, 'detail'), 'https://cdn.example.com/caja.png');
});

test('sin imagen editorial se usa el endpoint propio con el tamaño de cada vista', () => {
  const product = { id: 9326, image_url: null, has_image: true, image_version: '20260819002251' };
  assert.equal(getEmpaquesProductImageSrc(product), '/api/empaques/imagen/9326?s=1024&v=20260819002251');
  assert.equal(getEmpaquesProductImageSrc(product, 'detail'), '/api/empaques/imagen/9326?s=1920&v=20260819002251');
  assert.equal(getEmpaquesProductImageSrc({ id: 9326, image_url: null, has_image: false, image_version: null }), null);
  assert.equal(getEmpaquesProductImageSrc({ id: 9326, image_url: '   ', has_image: false, image_version: null }), null);
});

test('el endpoint solo acepta los tamaños que Odoo materializa', () => {
  assert.equal(parseEmpaquesImageSize(null), 1024);
  assert.equal(parseEmpaquesImageSize('512'), 512);
  assert.equal(parseEmpaquesImageSize('1920'), 1920);
  assert.equal(parseEmpaquesImageSize('999'), null);
  assert.equal(parseEmpaquesImageSize('1024px'), null);
  assert.equal(parseEmpaquesImageSize(''), null);
});

test('el MIME se infiere del encabezado base64 tal como lo entrega Odoo', () => {
  assert.equal(getBase64Mime('/9j/4AAQSkZJRg=='), 'image/jpeg');
  assert.equal(getBase64Mime('iVBORw0KGgoAAAANSUhEUg=='), 'image/png');
  assert.equal(getBase64Mime('UklGRlYAAABXRUJQ'), 'image/webp');
  assert.equal(getBase64Mime('R0lGODlhAQABAIAAAP'), 'image/gif');
  assert.equal(getBase64Mime('QUJD'), 'image/png');
});

test('personalizados conserva la fotografía inline (editorial https o data URL de image_1024)', () => {
  assert.equal(getEmpaquesInlineImageSrc({ image_url: 'https://cdn.example.com/bolsa.png', image_1024: '/9j/AAA=' }), 'https://cdn.example.com/bolsa.png');
  assert.equal(getEmpaquesInlineImageSrc({ image_url: null, image_1024: '/9j/AAA=' }), 'data:image/jpeg;base64,/9j/AAA=');
  assert.equal(getEmpaquesInlineImageSrc({ image_url: null, image_1024: false }), null);
});
