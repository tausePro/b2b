import assert from 'node:assert/strict';
import test from 'node:test';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { buildPushPayload, isGonePushStatus, parsePushSubscription, urlBase64ToUint8Array } from '../src/lib/push/shared';

test('push: acepta suscripciones de navegador con llaves P-256 reales y rechaza datos inválidos', () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomBytes(24).toString('base64url')}`;
  assert.deepEqual(parsePushSubscription({ endpoint, keys }), { endpoint, ...keys });
  for (const raw of [
    null, {}, { endpoint, keys: null }, { endpoint: 'http://push.example/inseguro', keys }, { endpoint: 'no-es-url', keys },
    { endpoint, keys: { ...keys, auth: 'x' } }, { endpoint, keys: { ...keys, p256dh: 'corta' } }, { endpoint: `https://${'a'.repeat(1001)}`, keys },
  ]) assert.equal(parsePushSubscription(raw), null);
});

test('push: el contenido se limpia, la ruta siempre es interna y 404/410 retiran el dispositivo', () => {
  assert.deepEqual(
    buildPushPayload({ title: '  Pedido   PED-2026-0053 por aprobar ', body: '48 HOORASS\n  S.A.S.', url: '/dashboard/pedidos/abc', tag: 'pedido-abc' }),
    { title: 'Pedido PED-2026-0053 por aprobar', body: '48 HOORASS S.A.S.', url: '/dashboard/pedidos/abc', tag: 'pedido-abc' },
  );
  for (const url of ['https://otro-sitio.example', '//otro-sitio.example', 'javascript:alert(1)', null]) assert.equal(buildPushPayload({ title: 'x', url }).url, '/dashboard');
  assert.equal(buildPushPayload({ title: '' }).title, 'Imprima B2B');
  assert.equal(buildPushPayload({ title: 'x'.repeat(200) }).title.length, 80);
  assert.equal('tag' in buildPushPayload({ title: 'x', tag: '  ' }), false);
  assert.deepEqual([404, 410, 400, 413, 429, 500, undefined].map(isGonePushStatus), [true, true, false, false, false, false, false]);
  const { publicKey } = webpush.generateVAPIDKeys();
  const bytes = urlBase64ToUint8Array(publicKey);
  assert.equal(bytes.length, 65);
  assert.equal(Buffer.from(bytes).toString('base64url'), publicKey);
});
