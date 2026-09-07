import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { getEmpaquesCaras, getEmpaquesImpresionSku, EMPAQUES_REFERENCIA_SKUS } from '../src/lib/empaques/personalizados-shared';
import { normalizeLandingConfig, landingConfigToExtra } from '../src/lib/empaques/landing-config-shared';
import { hashArteToken, validArteToken, readPersonalizacionJson, PersonalizadosError } from '../src/lib/empaques/personalizados.server';

const referenciaAdjunta = { sku: '2300100156', nombre: 'Quadseal kraft 250 g', alto_cm: 15, ancho_cm: 12.5, activo: true };

test('producción selecciona los SKU reales de una y dos caras', () => {
  assert.equal(getEmpaquesImpresionSku('produccion', 1), '2300100105');
  assert.equal(getEmpaquesImpresionSku('produccion', 2), '2300100190');
  assert.throws(() => getEmpaquesImpresionSku('produccion', 3));
});

test('la muestra utiliza un solo servicio independientemente del número de caras', () => {
  assert.equal(getEmpaquesImpresionSku('muestra', 1), '2300100191');
  assert.equal(getEmpaquesImpresionSku('muestra', 2), '2300100191');
  assert.deepEqual(getEmpaquesCaras(1), ['frente']);
  assert.deepEqual(getEmpaquesCaras(2), ['frente', 'reverso']);
  assert.throws(() => getEmpaquesCaras(0));
});

test('sin referencias configuradas no se ofrece un catálogo inventado', () => {
  assert.deepEqual(normalizeLandingConfig({}).personalizados.referencias, []);
  assert.equal(EMPAQUES_REFERENCIA_SKUS.length, 6);
});

test('normaliza la referencia del adjunto, conserva configuración y descarta duplicados', () => {
  const config = normalizeLandingConfig({ landing: { personalizados: { referencias: [referenciaAdjunta, referenciaAdjunta] } } });
  assert.deepEqual(config.personalizados.referencias, [referenciaAdjunta]);
  const persisted: Record<string, unknown> = landingConfigToExtra(config, { conservar: true });
  assert.equal(persisted.conservar, true);
  assert.deepEqual(normalizeLandingConfig(persisted).personalizados.referencias, [referenciaAdjunta]);
  assert.deepEqual(normalizeLandingConfig({ landing: { personalizados: { referencias: [{ ...referenciaAdjunta, ancho_cm: 0 }] } } }).personalizados.referencias, []);
});

test('los tokens de archivo se comparan por hash y no se aceptan alterados ni vacíos', () => {
  const token = randomBytes(32).toString('hex');
  const hash = hashArteToken(token);
  assert.notEqual(hash, token);
  assert.equal(validArteToken(token, hash), true);
  assert.equal(validArteToken(`${token[0] === 'a' ? 'b' : 'a'}${token.slice(1)}`, hash), false);
  assert.equal(validArteToken('', hash), false);
  assert.equal(validArteToken(token, ''), false);
});

test('SQL: la condición de servicio delimita CASE dentro del IF de PL/pgSQL', async (t) => {
  const sql = await readFile(new URL('../supabase/migrations/049_empaques_tiff_por_cara.sql', import.meta.url), 'utf8');
  const guard = sql.match(/  IF NOT \(v_alto > 0[\s\S]*?  END IF;/)?.[0];
  assert.ok(guard, 'No se encontró la validación SQL del servicio.');
  assert.match(guard, /<> \(CASE[\s\S]*END\) THEN/);
  const socket = process.env.EMPAQUES_SQL_TEST_SOCKET;
  if (!socket) {
    t.diagnostic('Regresión estructural verificada; PostgreSQL se ejecuta al definir EMPAQUES_SQL_TEST_SOCKET.');
    return;
  }
  const statement = `BEGIN READ ONLY;
DO $test$
DECLARE
  p_payload jsonb;
  p_archivos jsonb;
  v_caras smallint;
  v_alto numeric := 15;
  v_ancho numeric := 12.5;
  caso record;
  rechazo boolean;
BEGIN
  FOR caso IN SELECT * FROM (VALUES
    ('produccion', 1, '2300100105', false),
    ('produccion', 2, '2300100190', false),
    ('muestra', 1, '2300100191', false),
    ('muestra', 2, '2300100191', false),
    ('produccion', 1, '2300100190', true),
    ('muestra', 2, '2300100105', true)
  ) AS opciones(modalidad, caras, sku, debe_rechazar) LOOP
    v_caras := caso.caras;
    p_payload := jsonb_build_object('modalidad', caso.modalidad, 'cantidad', 1, 'impresion_sku', caso.sku);
    p_archivos := to_jsonb(ARRAY(SELECT numero FROM generate_series(1, caso.caras) AS numero));
    rechazo := false;
    BEGIN
${guard}
    EXCEPTION WHEN SQLSTATE 'PT400' THEN rechazo := true;
    END;
    IF rechazo IS DISTINCT FROM caso.debe_rechazar THEN
      RAISE EXCEPTION 'Validación de servicio incorrecta: % / % / %', caso.modalidad, caso.caras, caso.sku;
    END IF;
  END LOOP;
END;
$test$;
ROLLBACK;`;
  const output = execFileSync('psql', ['-X', '-h', socket, '-p', '55449', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: statement, encoding: 'utf8', timeout: 15000,
  });
  assert.match(output, /DO/);
  assert.match(output, /ROLLBACK/);
  t.diagnostic('El bloque real de 049 compiló y verificó seis combinaciones en PostgreSQL, dentro de una transacción de solo lectura.');
});

test('el receptor rechaza binarios o JSON sobredimensionado sin procesar archivos', async () => {
  const request = (body: string, contentType = 'application/json') => new NextRequest('https://empaques.imprima.com.co/api/empaques/personalizados', {
    method: 'POST', body, headers: { 'Content-Type': contentType },
  });
  await assert.rejects(readPersonalizacionJson(request('archivo', 'multipart/form-data')), (error) => error instanceof PersonalizadosError && error.status === 415);
  await assert.rejects(readPersonalizacionJson(request('{')), (error) => error instanceof PersonalizadosError && error.status === 400);
  await assert.rejects(readPersonalizacionJson(request(JSON.stringify('x'.repeat(20000)))), (error) => error instanceof PersonalizadosError && error.status === 413);
  assert.deepEqual(await readPersonalizacionJson(request('{"caras":2}')), { caras: 2 });
});
