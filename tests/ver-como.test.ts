import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from 'dotenv';
import { isViewAsRequestAllowed, isViewAsSupabaseRequestAllowed, readViewAsUiCookie, VIEW_AS_EXIT_PATH } from '../src/lib/auth/viewAs';
import { openViewAs, sealViewAs } from '../src/lib/auth/viewAs.server';

config({ path: '.env.local', quiet: true });

test('ver como: el portal y Supabase quedan en solo lectura, salvo salir y refrescar la sesión', () => {
  assert.equal(isViewAsRequestAllowed('GET', '/dashboard/comisiones'), true);
  assert.equal(isViewAsRequestAllowed('POST', VIEW_AS_EXIT_PATH), true);
  for (const [method, path] of [['POST', '/api/leads'], ['PUT', '/api/leads'], ['PATCH', '/api/pedidos/1'], ['DELETE', '/api/leads'], ['POST', '/api/admin/ver-como']]) {
    assert.equal(isViewAsRequestAllowed(method, path), false, `${method} ${path}`);
  }
  const base = 'https://mubdgefafbijdliblccl.supabase.co';
  assert.equal(isViewAsSupabaseRequestAllowed(`${base}/rest/v1/pedidos?select=*`, 'GET', base), true);
  assert.equal(isViewAsSupabaseRequestAllowed(`${base}/rest/v1/rpc/get_mi_perfil`, 'POST', base), true);
  assert.equal(isViewAsSupabaseRequestAllowed(`${base}/auth/v1/token?grant_type=refresh_token`, 'POST', base), true);
  for (const [url, method] of [
    [`${base}/rest/v1/pedidos`, 'POST'], [`${base}/rest/v1/pedidos?id=eq.1`, 'PATCH'], [`${base}/rest/v1/leads?id=eq.1`, 'DELETE'],
    [`${base}/rest/v1/rpc/enlazar_mi_usuario_por_email`, 'POST'], [`${base}/auth/v1/token?grant_type=password`, 'POST'],
    [`${base}/auth/v1/logout`, 'POST'], [`${base}/storage/v1/object/landing/archivo.png`, 'POST'],
  ]) assert.equal(isViewAsSupabaseRequestAllowed(url, method, base), false, `${method} ${url}`);
  assert.equal(readViewAsUiCookie('a=1; b2b_view_as_ui=Nic%C3%B3las%20Oliveros'), 'Nicólas Oliveros');
  assert.equal(readViewAsUiCookie('a=1'), null);
  assert.equal(readViewAsUiCookie('b2b_view_as_ui=%E0%A4%A'), null);
});

test('ver como: el marcador va cifrado y una alteración lo invalida', () => {
  const session = { actorId: 'actor', targetId: 'objetivo', targetName: 'Nicólas Oliveros', auditId: 'auditoria', startedAt: 1, adminRefreshToken: 'token-de-retorno' };
  const sealed = sealViewAs(session);
  assert.deepEqual(openViewAs(sealed), session);
  assert.equal(sealed.includes('token-de-retorno'), false);
  assert.equal(openViewAs(`${sealed.slice(0, -2)}xx`), null);
  for (const value of [undefined, '', 'a.b', 'a.b.c.d']) assert.equal(openViewAs(value), null);
});
