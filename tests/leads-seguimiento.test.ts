import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdvisorLeadStats, buildLeadSummary, filterByOrigin, formatHours, formatTimeAgo, isLeadOverdue, leadAttribution, leadSource, MANUAL_LEAD_SOURCE, whatsappLink,
  type LeadTrackingInput,
} from '../src/lib/leads/seguimiento';

test('leads: gestión por asesora y registro manual', () => {
  const now = Date.parse('2026-11-17T20:00:00Z');
  const lead = (estado: string, created_at: string, asignado_a: string | null, extra: Partial<LeadTrackingInput> = {}) => ({
    id: `${asignado_a}-${created_at}`, nombre: '', empresa: null, email: null, telefono: null, mensaje: null, estado, fuente: MANUAL_LEAD_SOURCE, created_at,
    gclid: null, utm_source: null, utm_medium: null, utm_campaign: null, asignado_a, asignado_nombre: asignado_a ? 'VANESA PATIÑO GALVIS' : null, ...extra,
  });
  assert.equal(leadSource(MANUAL_LEAD_SOURCE).label, 'Asesora · Registro manual');
  const stats = buildAdvisorLeadStats([
    lead('nuevo', '2026-11-17T10:00:00Z', 'v'), lead('contactado', '2026-11-16T10:00:00Z', 'v', { contactado_at: '2026-11-16T11:30:00Z' }),
    lead('convertido', '2026-11-10T10:00:00Z', 'v', { contactado_at: '2026-11-10T10:30:00Z' }), lead('nuevo', '2026-11-17T19:00:00Z', null),
  ], now);
  assert.deepEqual(stats.map((row) => [row.name, row.total, row.uncontacted, row.overdue, row.contacted, row.converted, row.conversionPercent]), [
    // Los leads de prospección no entran en el plazo de 2 horas: ninguno queda "fuera de plazo".
    ['VANESA PATIÑO GALVIS', 3, 1, 0, 1, 1, 33.3], ['Sin asignar', 1, 1, 0, 0, 0, 0],
  ]);
  assert.equal(formatHours(stats[0].averageResponseHours!), '1 h');
});

test('leads: la prospección se separa del sitio web y no entra en el plazo de 2 horas', () => {
  const now = Date.parse('2026-11-18T22:00:00Z');
  const web = { estado: 'nuevo', created_at: '2026-11-18T18:00:00Z', fuente: 'empaques_hero' };
  const manual = { ...web, fuente: MANUAL_LEAD_SOURCE };
  assert.equal(isLeadOverdue(web, now), true);
  assert.equal(isLeadOverdue(manual, now), false);
  assert.deepEqual(filterByOrigin([web, manual], 'web'), [web]);
  assert.deepEqual(filterByOrigin([web, manual], 'prospeccion'), [manual]);
  assert.equal(filterByOrigin([web, manual], 'todos').length, 2);
});

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
