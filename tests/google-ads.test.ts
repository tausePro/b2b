import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { isEmpaquesAdsSurface } from '../src/lib/analytics/adsScope';
import { buildGoogleAdsConversion, createGoogleTagQueue, createLeadConversionTracker, safeGoogleAdsPageLocation, type AdsTrackingContext } from '../src/lib/analytics/googleAds';

const existingLeadId = '93ef2198-eb17-4428-b631-1ed169cc5cb3';
const context: AdsTrackingContext = { hostname: 'empaques.imprima.com.co', protocol: 'https:', pathname: '/' };
const receipt = { ok: true, leadId: existingLeadId };

test('la cola conserva objetos Arguments reales como exige gtag, sin cargar Google', () => {
  const layer: unknown[] = [];
  const tag = createGoogleTagQueue(layer);
  tag('config', 'AW-17631992798');
  tag('event', 'conversion', buildGoogleAdsConversion(receipt));
  assert.equal(Object.prototype.toString.call(layer[0]), '[object Arguments]');
  assert.equal(Array.isArray(layer[0]), false);
  assert.deepEqual(Array.from(layer[1] as IArguments), ['event', 'conversion', buildGoogleAdsConversion(receipt)]);
});

test('la ubicación enviada excluye búsquedas, correos y fragmentos de la URL', () => {
  const url = new URL('https://empaques.imprima.com.co/');
  url.searchParams.set('categoria', '128');
  url.searchParams.set('email', 'jufecama@gmail.com');
  url.searchParams.set('q', 'jufecama@gmail.com');
  url.hash = 'cotizar';
  assert.equal(safeGoogleAdsPageLocation(url.href), 'https://empaques.imprima.com.co/?categoria=128');
});

test('la medición se limita a las páginas públicas del dominio de Empaques', () => {
  for (const pathname of ['/', '/empaques', '/personalizados', '/empaques/personalizados', '/empaques/7179', '/7179', '/contacto', '/privacidad']) {
    assert.equal(isEmpaquesAdsSurface(context.hostname, pathname), true);
  }
  for (const hostname of ['imprima.com.co', 'b2b.imprima.com.co', 'empaques.imprima.com.co.otro', 'localhost', '127.0.0.1']) {
    assert.equal(isEmpaquesAdsSurface(hostname, '/'), false);
  }
  for (const pathname of ['/admin', '/admin/leads', '/dashboard', '/login', '/auth/callback', '/api/leads', '/catalogo', '//admin', '/empaques/no-existe']) {
    assert.equal(isEmpaquesAdsSurface(context.hostname, pathname), false);
  }
  assert.equal(isEmpaquesAdsSurface('empaques.localhost', '/'), true);
});

test('el componente no renderiza ningún elemento ni controles visibles', () => {
  const text = readFileSync(path.join(__dirname, '../src/components/public/EmpaquesAds.tsx'), 'utf8');
  const source = ts.createSourceFile('EmpaquesAds.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tags: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node.tagName.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual(tags, []);
  assert.match(text, /return null;/);
  assert.match(text, /document\.createElement\('script'\)/);
});

test('la etiqueta estándar no inventa ni persiste señales de consentimiento', () => {
  const source = readFileSync(path.join(__dirname, '../src/lib/analytics/googleAds.ts'), 'utf8');
  assert.doesNotMatch(source, /['\"]consent['\"]|localStorage|ADS_CONSENT/);
});

test('el payload usa exactamente la acción enviada por Juan y el valor fijo, no los datos del formulario', () => {
  assert.deepEqual(buildGoogleAdsConversion(receipt), {
    send_to: 'AW-17631992798/Vc9FCIf83KgbEN63y9dB', value: 1, currency: 'COP', transaction_id: existingLeadId,
  });
  assert.equal(buildGoogleAdsConversion({ ...receipt, ok: false }), null);
  for (const leadId of [undefined, '', 'sin-confirmacion', `${existingLeadId}\n`, { id: existingLeadId }]) {
    assert.equal(buildGoogleAdsConversion({ ok: true, leadId }), null);
  }
});

test('una solicitud confirmada espera la carga del script y se despacha una sola vez por ID', () => {
  const events: unknown[] = [];
  const tracker = createLeadConversionTracker({ context: () => context, dispatch: (event) => events.push(event) });
  tracker.report(receipt);
  tracker.report(receipt);
  assert.equal(events.length, 0);
  tracker.markReady();
  assert.equal(events.length, 1);
  tracker.markReady();
  tracker.report({ ...receipt, leadId: existingLeadId.toUpperCase() });
  assert.equal(events.length, 1);
});

test('cargar la etiqueta o visitar una página no genera conversiones', () => {
  const events: unknown[] = [];
  const tracker = createLeadConversionTracker({ context: () => context, dispatch: (event) => events.push(event) });
  tracker.markReady();
  tracker.report({ ok: false, leadId: existingLeadId });
  tracker.report({ ok: true, leadId: null });
  tracker.markReady();
  assert.equal(events.length, 0);
});

test('salir del sitio público mientras carga el script descarta la conversión pendiente', () => {
  let current: AdsTrackingContext = context;
  const events: unknown[] = [];
  const tracker = createLeadConversionTracker({ context: () => current, dispatch: (event) => events.push(event) });
  tracker.report(receipt);
  current = { ...context, pathname: '/login' };
  tracker.reset();
  tracker.markReady();
  current = context;
  tracker.markReady();
  assert.equal(events.length, 0);
});

test('localhost, previews, HTTP y rutas privadas nunca despachan eventos', () => {
  for (const current of [{ ...context, hostname: 'empaques.localhost' }, { ...context, hostname: 'b2b.imprima.com.co' }, { ...context, protocol: 'http:' }, { ...context, pathname: '/admin/leads' }]) {
    const events: unknown[] = [];
    const tracker = createLeadConversionTracker({ context: () => current, dispatch: (event) => events.push(event) });
    tracker.markReady();
    tracker.report(receipt);
    assert.equal(events.length, 0);
  }
});

test('el registro de sesión evita repetir un ID despachado antes de recargar', () => {
  const events: unknown[] = [];
  const tracker = createLeadConversionTracker({ context: () => context, dispatch: (event) => events.push(event), dispatchedIds: [existingLeadId] });
  tracker.markReady();
  tracker.report(receipt);
  assert.equal(events.length, 0);
});

test('un error del transporte de medición no se propaga al formulario', () => {
  const tracker = createLeadConversionTracker({ context: () => context, dispatch: () => { throw new Error('Transporte no disponible'); } });
  assert.doesNotThrow(() => tracker.report(receipt));
  assert.doesNotThrow(() => tracker.markReady());
});
