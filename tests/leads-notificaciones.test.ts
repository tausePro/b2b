import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  listDefaultNotificationEmailTemplates,
  renderEditableNotificationTemplate,
} from '../src/lib/notifications/emailTemplateStore';
import { renderNotificationEmail } from '../src/lib/email/templates/notificaciones';

const leadContext = {
  lead_nombre: 'María Pérez',
  lead_empresa: 'Café & Granos <SAS>',
  lead_contacto: 'maria@example.com · 3001234567',
  lead_fuente: 'empaques_personalizados',
  lead_resumen: 'Empaque personalizado: Bolsa Quadseal (ref. 2300100156). Modalidad muestra, 2 cara(s). Cantidad: 500. Artes recibidos: 2 archivo(s); descárgalos desde el panel (no se adjuntan al correo).',
  destinatario_nombre: 'Juan Felipe',
  destinatario_email: 'jufecama@gmail.com',
  ruta: '/admin/leads?lead=0cdd7637-5cb0-4b06-8ab1-29697c2da7e9',
};

test('existe la plantilla por defecto de lead con sus variables propias', () => {
  const template = listDefaultNotificationEmailTemplates().find((item) => item.tipo === 'lead_creado');
  assert.ok(template, 'Falta la plantilla lead_creado');
  assert.equal(template.activa, true);
  const keys = template.variables.map((variable) => variable.key);
  for (const key of ['lead_nombre', 'lead_contacto', 'lead_fuente', 'lead_resumen', 'ruta']) {
    assert.ok(keys.includes(key as typeof keys[number]), `Falta la variable ${key}`);
  }
});

test('el correo del lead resuelve datos reales y enlaza el detalle del panel', () => {
  const template = listDefaultNotificationEmailTemplates().find((item) => item.tipo === 'lead_creado');
  assert.ok(template);
  const resolved = renderEditableNotificationTemplate(
    { ...template, created_at: null, updated_at: null },
    leadContext,
  );
  assert.equal(resolved.asunto, 'Nuevo lead: María Pérez — empaques_personalizados');

  const rendered = renderNotificationEmail({
    asunto: resolved.asunto,
    tipo: 'lead_creado',
    payload: { ...leadContext, titulo: resolved.titulo, intro: resolved.intro, descripcion: resolved.descripcion, cta_label: resolved.ctaLabel },
  });
  assert.ok(rendered.text.includes('María Pérez'));
  assert.ok(rendered.text.includes('maria@example.com · 3001234567'));
  assert.ok(rendered.text.includes('Artes recibidos: 2 archivo(s)'));
  assert.ok(rendered.text.includes('/admin/leads?lead=0cdd7637-5cb0-4b06-8ab1-29697c2da7e9'));
  assert.ok(rendered.html.includes('Café &amp; Granos &lt;SAS&gt;'), 'La empresa debe escaparse en el HTML');
  assert.equal(rendered.html.includes('<SAS>'), false);
  assert.equal(/\.tiff?/i.test(rendered.text), false, 'El correo no debe enlazar archivos TIFF directamente');
});

test('la migración 051 permite lead_creado, siembra la plantilla y los dos destinatarios', () => {
  const sql = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '051_leads_notificaciones_email.sql'), 'utf8');
  for (const tabla of ['notificaciones_email_tipo_check', 'notificaciones_email_templates_tipo_check']) {
    const constraint = sql.split(tabla)[2] ?? '';
    assert.ok(constraint.includes("'lead_creado'"), `El CHECK ${tabla} debe incluir lead_creado`);
    for (const tipo of ['pedido_creado_en_aprobacion', 'pedido_creado_autoaprobado', 'pedido_aprobado', 'pedido_rechazado', 'pedido_validado', 'pedido_procesado_odoo']) {
      assert.ok(constraint.includes(`'${tipo}'`), `El CHECK ${tabla} debe conservar ${tipo}`);
    }
  }
  assert.ok(sql.includes("'config_leads_notificaciones'"));
  assert.ok(sql.includes("'jufecama@gmail.com'"));
  assert.ok(sql.includes("'nicolas.imprima@gmail.com'"));
  assert.ok(sql.includes('ON CONFLICT (tipo) DO NOTHING'));
  assert.ok(sql.includes('ON CONFLICT (id) DO NOTHING'));
  assert.equal((sql.match(/BEGIN;/g) ?? []).length, 1);
  assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
});
