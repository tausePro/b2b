import assert from 'node:assert/strict';
import test from 'node:test';
import { INSTALL_SNOOZE_MS, isInstallSnoozed, isIosDevice, isMobileDevice } from '../src/lib/pwa/install';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

test('instalar en el celular: detecta iPhone, iPad en modo escritorio y Android, pero no el computador', () => {
  assert.equal(isIosDevice(IPHONE, 'iPhone', 5), true);
  assert.equal(isIosDevice(IPAD_DESKTOP_MODE, 'MacIntel', 5), true);
  assert.equal(isIosDevice(IPAD_DESKTOP_MODE, 'MacIntel', 0), false);
  assert.equal(isIosDevice(ANDROID, 'Linux armv8l', 5), false);
  assert.deepEqual([
    isMobileDevice(IPHONE, 'iPhone', 5), isMobileDevice(ANDROID, 'Linux armv8l', 5),
    isMobileDevice(DESKTOP_CHROME, 'MacIntel', 0), isMobileDevice(IPAD_DESKTOP_MODE, 'MacIntel', 0),
  ], [true, true, false, false]);
});

test('instalar en el celular: "Ahora no" aplaza la sugerencia 14 días y tolera valores dañados', () => {
  const now = Date.UTC(2026, 10, 10, 15);
  assert.equal(isInstallSnoozed(null, now), false);
  assert.equal(isInstallSnoozed(String(now - 60_000), now), true);
  assert.equal(isInstallSnoozed(String(now - INSTALL_SNOOZE_MS + 1), now), true);
  assert.equal(isInstallSnoozed(String(now - INSTALL_SNOOZE_MS), now), false);
  assert.equal(isInstallSnoozed(String(now + 60_000), now), false);
  assert.equal(isInstallSnoozed('dañado', now), false);
});
