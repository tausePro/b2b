import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLeadSummary, formatHours, formatTimeAgo, isLeadOverdue, leadAttribution, leadSource, whatsappLink, type LeadTrackingInput,
} from '../src/lib/leads/seguimiento';

test('leads: las fuentes reales se agrupan en orígenes legibles', () => {
  assert.equal(leadSource('empaques_hero').label, 'Empaques · Inicio');
  assert.equal(leadSource('empaques_cotizacion').label, 'Empaques · Cotización');
  assert.equal(leadSource('empaques_producto_11448').label, 'Empaques · Producto');
  assert.equal(leadSource('empaques_personalizados').label, 'Empaques · Personalizados');
  assert.equal(leadSource('contacto_formulario').label, 'Contacto · Formulario');
  assert.equal(leadSource('contacto_whatsapp').label, 'WhatsApp · Contacto');
  assert.equal(leadSource('whatsapp_bubble').label, 'WhatsApp · Burbuja');
  assert.equal(leadSource('producto_12_cta').label, 'Producto · Detalle');
  assert.equal(leadSource('contacto_comercial_vanesa').label, 'Contacto · Equipo comercial');
});

test('leads: atribución, plazo de contacto de 2 horas y tiempos legibles', () => {
  const ads = { gclid: 'Cj0KCQiA', utm_source: null, utm_medium: null, utm_campaign: null };
  assert.equal(leadAttribution(ads), 'google_ads');
  assert.equal(leadAttribution({ ...ads, gclid: null, utm_campaign: 'empaques_doypack_nov' }), 'utm');
  assert.equal(leadAttribution({ ...ads, gclid: null }), 'organico');
  const now = Date.parse('2026-11-12T20:00:00Z');
  assert.equal(isLeadOverdue({ estado: 'nuevo', created_at: '2026-11-12T17:59:00Z' }, now), true);
  assert.equal(isLeadOverdue({ estado: 'nuevo', created_at: '2026-11-12T18:30:00Z' }, now), false);
  assert.equal(isLeadOverdue({ estado: 'contactado', created_at: '2026-11-10T08:00:00Z' }, now), false);
  assert.deepEqual(['2026-11-12T19:18:00Z', '2026-11-12T17:00:00Z', '2026-11-10T20:00:00Z'].map((iso) => formatTimeAgo(iso, now)), ['hace 42 min', 'hace 3 h', 'hace 2 d']);
  assert.deepEqual([formatHours(3 + 20 / 60), formatHours(0.5), formatHours(26)], ['3 h 20 min', '30 min', '1 d 2 h']);
  assert.equal(whatsappLink('123', 'X'), null);
  assert.equal(whatsappLink(null, 'X'), null);
});

test('leads: resumen del período, comparación, embudo y tiempo de respuesta', () => {
  const now = Date.parse('2026-11-12T20:00:00Z');
  const lead = (estado: string, created_at: string, extra: Partial<LeadTrackingInput> = {}): LeadTrackingInput => ({
    id: created_at, nombre: '', empresa: null, email: null, telefono: null, mensaje: null, estado, fuente: 'empaques_hero', created_at,
    gclid: 'g', utm_source: null, utm_medium: null, utm_campaign: null, ...extra,
  });
  const summary = buildLeadSummary([
    lead('nuevo', '2026-11-12T17:00:00Z'),
    lead('nuevo', '2026-11-12T19:00:00Z', { fuente: 'empaques_cotizacion', gclid: null }),
    lead('contactado', '2026-11-11T10:00:00Z', { contactado_at: '2026-11-11T13:20:00Z' }),
    lead('convertido', '2026-11-05T10:00:00Z', { contactado_at: '2026-11-05T11:00:00Z' }),
    lead('descartado', '2026-10-20T10:00:00Z', { fuente: 'whatsapp_bubble', gclid: null }),
    lead('convertido', '2026-10-01T10:00:00Z'),
  ], now);
  assert.deepEqual([summary.total, summary.previousTotal, summary.changePercent], [5, 1, 400]);
  assert.deepEqual([summary.uncontacted, summary.overdue, summary.converted, summary.conversionPercent], [2, 1, 1, 20]);
  assert.deepEqual(summary.googleAds, { count: 3, percent: 60, converted: 1 });
  assert.deepEqual(summary.funnel.map((stage) => [stage.estado, stage.count, stage.percent]), [['nuevo', 2, 40], ['contactado', 1, 20], ['convertido', 1, 20], ['descartado', 1, 20]]);
  assert.equal(formatHours(summary.averageResponseHours!), '2 h 10 min');
  assert.deepEqual(summary.sources[0], { label: 'Empaques · Inicio', count: 3, converted: 1 });
  assert.deepEqual(summary.attribution.map((entry) => [entry.kind, entry.percent]), [['google_ads', 60], ['utm', 0], ['organico', 40]]);
});
