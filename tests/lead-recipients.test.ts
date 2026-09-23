import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { INTERNAL_LEAD_NOTIFICATION_SECTION, PUBLIC_LANDING_FIELDS, isInternalLandingSection } from '../src/lib/landing/privateSections';
import { parseLeadNotificationSettings, recipientsFromPrivateSettings } from '../src/lib/notifications/leadRecipients';

const emails = ['jufecama@gmail.com', 'nicolas.imprima@gmail.com', 'vanesapgalvis3@gmail.com', 'vanesa.patino@imprima.com.co'];
const version = new Date().toISOString();
const input = () => ({ activo: true, destinatarios: emails.map((email) => ({ email, nombre: null })), expected_updated_at: version });

test('conserva los cuatro destinatarios solicitados y no inventa nombres', () => {
  const parsed = parseLeadNotificationSettings(input());
  assert.deepEqual(parsed.destinatarios.map((item) => item.email), emails);
  assert.ok(parsed.destinatarios.every((item) => item.nombre === null));
  assert.equal(parsed.expected_updated_at, version);
});

test('deduplica correos sin distinguir mayúsculas y conserva el nombre registrado', () => {
  const value = input();
  value.destinatarios.push({ email: '  JUFECAMA@gmail.com ', nombre: null });
  const parsed = parseLeadNotificationSettings({ ...value, destinatarios: [{ email: emails[0], nombre: 'Juan Felipe' }, ...value.destinatarios] });
  assert.equal(parsed.destinatarios[0].nombre, 'Juan Felipe');
  assert.equal(parsed.destinatarios.length, 4);
  assert.equal(parsed.destinatarios[0].email, emails[0]);
});

test('rechaza direcciones inválidas, entradas excesivas y configuraciones activas sin destinatarios', () => {
  for (const email of ['', 'sin-correo', '@', `${emails[0]}\r\nBcc: ${emails[1]}`]) {
    assert.throws(() => parseLeadNotificationSettings({ ...input(), destinatarios: [{ email }] }));
  }
  assert.throws(() => parseLeadNotificationSettings({ ...input(), destinatarios: Array.from({ length: 11 }, () => ({ email: emails[0] })) }));
  assert.throws(() => parseLeadNotificationSettings({ ...input(), destinatarios: [] }));
  assert.throws(() => parseLeadNotificationSettings({ ...input(), activo: 'true' }));
});

test('desactivar la lista impide el envío sin eliminar los destinatarios configurados', () => {
  const parsed = parseLeadNotificationSettings({ ...input(), activo: false });
  assert.equal(parsed.destinatarios.length, 4);
  assert.deepEqual(recipientsFromPrivateSettings(parsed), []);
  assert.deepEqual(recipientsFromPrivateSettings(parseLeadNotificationSettings(input())).map((item) => item.email), emails);
});

test('requiere la versión leída para impedir sobrescribir ediciones concurrentes', () => {
  for (const expected_updated_at of [null, undefined, '', 'ayer', `${version}\n`]) {
    assert.throws(() => parseLeadNotificationSettings({ ...input(), expected_updated_at }));
  }
  assert.equal(parseLeadNotificationSettings({ ...input(), expected_updated_at: '2026-09-17T21:58:03.38667+00:00' }).expected_updated_at, '2026-09-17T21:58:03.38667+00:00');
});

test('las configuraciones internas se excluyen de las secciones publicables', () => {
  assert.equal(isInternalLandingSection(INTERNAL_LEAD_NOTIFICATION_SECTION), true);
  for (const id of ['hero', 'seo', 'config_whatsapp', 'pagina_contacto']) assert.equal(isInternalLandingSection(id), false);
  assert.equal(PUBLIC_LANDING_FIELDS.includes('borrador'), false);
  assert.equal(PUBLIC_LANDING_FIELDS.includes('*'), false);
});

test('052 preserva destinatarios anteriores, agrega las dos direcciones y protege tabla e historial', () => {
  const sql = readFileSync(path.join(__dirname, '../supabase/migrations/052_destinatarios_leads_privados.sql'), 'utf8');
  assert.match(sql, /FROM public\.landing_contenido WHERE id = 'config_leads_notificaciones'/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.ok(sql.includes(emails[2]));
  assert.ok(sql.includes(emails[3]));
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.lead_notification_settings FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /AS RESTRICTIVE FOR ALL TO anon, authenticated/);
  assert.match(sql, /landing_contenido_versiones/);
  assert.doesNotMatch(sql, /DELETE FROM|DROP TABLE|UPDATE public\.pedidos/);
  assert.ok(sql.startsWith('BEGIN;') && sql.trim().endsWith('COMMIT;'));
});

test('la API de configuración exige Super Admin y versión esperada, sin ejecutar envíos', () => {
  const source = readFileSync(path.join(__dirname, '../src/app/api/admin/configuracion/leads/route.ts'), 'utf8');
  assert.match(source, /authorizeApiRoles\(\['super_admin'\]\)/);
  assert.match(source, /auth\.actor\.rol === 'super_admin'/);
  assert.match(source, /\.eq\('updated_at', input\.expected_updated_at\)/);
  assert.match(source, /VERSION_CONFLICT/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /sendTransactionalEmail|processPendingEmailNotifications|enqueueLeadNotifications/);
});
