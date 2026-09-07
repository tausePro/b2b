import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeLandingConfig } from '../src/lib/empaques/landing-config-shared';
import { EMPAQUES_REFERENCIA_SKUS, EMPAQUES_IMPRESION_SKUS, EMPAQUES_TIFF_MAX_BYTES } from '../src/lib/empaques/personalizados-shared';
import { getServerOdooConfig } from '../src/lib/odoo/serverConfig';
import { authenticate, searchRead } from '../src/lib/odoo/client';

config({ path: '.env.local', quiet: true });
function client(admin = true) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = admin ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.ok(url && key, 'Faltan variables de Supabase.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

test('049: referencias reales configuradas y columnas nuevas disponibles', async () => {
  const admin = client();
  const { data, error } = await admin.from('storefront_configs').select('configuracion_extra').eq('slug', 'empaques').single();
  assert.ifError(error);
  const referencias = normalizeLandingConfig(data?.configuracion_extra).personalizados.referencias;
  assert.equal(referencias.length, 6, 'Falta aplicar o revisar la migración 049.');
  assert.deepEqual(referencias.map((row) => row.sku).sort(), [...EMPAQUES_REFERENCIA_SKUS].sort());
  const detail = await admin.from('lead_empaques_personalizados')
    .select('id, solicitud_id, referencia_sku, impresion_sku, modalidad, caras, area_alto_cm, area_ancho_cm').limit(1);
  assert.ifError(detail.error);
});

test('049: cargas privadas y bucket TIFF conservan formatos históricos', async () => {
  const admin = client();
  const anon = client(false);
  const [uploads, anonymous, bucket] = await Promise.all([
    admin.from('empaques_tiff_cargas').select('id, estado, expires_at').limit(1),
    anon.from('empaques_tiff_cargas').select('id').limit(1),
    admin.storage.getBucket('empaques-solicitudes'),
  ]);
  assert.ifError(uploads.error);
  assert.equal(anonymous.error?.code, '42501');
  assert.ifError(bucket.error);
  assert.equal(bucket.data?.public, false);
  assert.ok(Number(bucket.data?.file_size_limit) >= EMPAQUES_TIFF_MAX_BYTES);
  for (const type of ['image/tiff', 'image/png', 'image/jpeg', 'image/webp', 'application/pdf']) {
    assert.ok(bucket.data?.allowed_mime_types?.includes(type));
  }
});

test('Odoo: las seis bolsas y los tres servicios siguen activos sin modificar el ERP', async () => {
  const odooConfig = await getServerOdooConfig();
  assert.ok(odooConfig);
  const session = await authenticate(odooConfig);
  const skus = [...EMPAQUES_REFERENCIA_SKUS, ...Object.values(EMPAQUES_IMPRESION_SKUS)];
  const productos = await searchRead('product.product', [['default_code', 'in', skus]], ['id', 'default_code', 'active', 'sale_ok'], { session, limit: 30 });
  for (const sku of skus) {
    const matches = productos.filter((producto) => producto.default_code === sku);
    assert.equal(matches.length, 1, `SKU ausente o duplicado en Odoo: ${sku}`);
    assert.equal(matches[0].active, true);
    assert.equal(matches[0].sale_ok, true);
  }
});
