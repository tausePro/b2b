import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { authenticate, read, type OdooSession } from '../src/lib/odoo/client';
import { getServerOdooConfig } from '../src/lib/odoo/serverConfig';
import { calculateOdooPlatformBonuses, calculatePlatformBonuses, getPlatformBonusCalculationHash, loadPortalBonusOrders } from '../src/lib/comisiones/bonoPlataforma.server';
import { calculatePlatformBonus, PLATFORM_BONUS_START_DATE, roundCurrency, summarizePlatformBonus } from '../src/lib/comisiones/bonoPlataforma';

config({ path: '.env.local', quiet: true });

function getClient(admin = true) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = admin ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.ok(url && key, 'Faltan variables de Supabase para las verificaciones de solo lectura.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadRealInput() {
  const db = getClient();
  const [advisorResult, assignmentResult, companyResult, membershipResult, userResult, schemaResult] = await Promise.all([
    db.from('usuarios').select('id, nombre, apellido, odoo_user_id').eq('rol', 'asesor').eq('activo', true),
    db.from('asesor_empresas').select('usuario_id, empresa_id').eq('activo', true),
    db.from('empresas').select('id, nombre, activa').eq('activa', true),
    db.from('usuario_empresas').select('empresa_id, usuario_id').eq('activo', true),
    db.from('usuarios').select('id').in('rol', ['comprador', 'aprobador']).eq('activo', true),
    db.from('asesor_empresas').select('usuario_id, empresa_id, bono_plataforma_desde, bono_plataforma_activo').eq('activo', true),
  ]);
  for (const result of [advisorResult, assignmentResult, companyResult, membershipResult, userResult]) assert.ifError(result.error);
  if (schemaResult.error) assert.equal(schemaResult.error.code, '42703', 'Error distinto de migración 048 pendiente.');
  const userIds = new Set((userResult.data ?? []).map((user) => user.id));
  const companyIds = new Set((membershipResult.data ?? []).filter((membership) => userIds.has(membership.usuario_id)).map((membership) => membership.empresa_id));
  const companies = (companyResult.data ?? []).filter((company) => companyIds.has(company.id));
  const assignments = schemaResult.error
    ? (assignmentResult.data ?? []).map((assignment) => ({ ...assignment, bono_plataforma_desde: PLATFORM_BONUS_START_DATE }))
    : (schemaResult.data ?? []).filter((assignment) => assignment.bono_plataforma_activo);
  const portalOrders = await loadPortalBonusOrders(db, companies.map((company) => company.id));
  const odooConfig = await getServerOdooConfig();
  assert.ok(odooConfig, 'Falta configuración real de Odoo.');
  const session = await authenticate(odooConfig);
  return { advisors: advisorResult.data ?? [], assignments, companies, portalOrders, period: '2026-09', session, migrationApplied: !schemaResult.error };
}

async function readChunks(session: OdooSession, model: string, ids: number[], fields: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) rows.push(...await read(model, ids.slice(offset, offset + 100), fields, session));
  return rows;
}

let inputPromise: ReturnType<typeof loadRealInput> | undefined;
function realInput() {
  inputPromise ??= loadRealInput();
  return inputPromise;
}

let calculationPromise: ReturnType<typeof calculateOdooPlatformBonuses> | undefined;
async function realCalculation() {
  calculationPromise ??= realInput().then((input) => calculateOdooPlatformBonuses(input));
  return calculationPromise;
}

test('Odoo: cada importe concuerda con líneas reales publicadas, sin impuestos ni duplicados', async (t) => {
  const input = await realInput();
  const results = await realCalculation();
  const details = results.flatMap((result) => result.details);
  assert.ok(details.length > 0, 'No hay documentos reales para verificar el periodo acordado.');
  const invoiceIds = [...new Set(details.map((detail) => detail.invoiceId))];
  const lineIds = details.flatMap((detail) => detail.invoiceLineIds);
  assert.equal(new Set(lineIds).size, lineIds.length, 'Una línea se liquidó más de una vez.');
  const [invoices, lines, sales] = await Promise.all([
    readChunks(input.session, 'account.move', invoiceIds, ['id', 'state', 'move_type', 'invoice_date', 'company_currency_id', 'invoice_user_id']),
    readChunks(input.session, 'account.move.line', lineIds, ['id', 'move_id', 'display_type', 'tax_line_id', 'sale_line_ids', 'balance']),
    readChunks(input.session, 'sale.order', [...new Set(details.flatMap((detail) => detail.saleOrderIds))], ['id', 'order_line']),
  ]);
  const invoiceMap = new Map(invoices.map((invoice) => [Number(invoice.id), invoice]));
  const lineMap = new Map(lines.map((line) => [Number(line.id), line]));
  const saleMap = new Map(sales.map((sale) => [Number(sale.id), sale]));
  const orderMap = new Map(input.portalOrders.map((order) => [order.id, order]));
  for (const result of results) {
    assert.deepEqual(summarizePlatformBonus(result.clients, result.details).totals, result.totals);
    for (const detail of result.details) {
      const invoice = invoiceMap.get(detail.invoiceId)!;
      assert.equal(invoice.state, 'posted');
      assert.equal(invoice.invoice_date, detail.invoiceDate);
      assert.equal(invoice.move_type, detail.documentType);
      assert.equal((invoice.company_currency_id as [number, string])[1], 'COP');
      assert.ok(detail.invoiceDate >= PLATFORM_BONUS_START_DATE && detail.invoiceDate <= '2026-09-30');
      const allowedSaleLines = new Set(detail.saleOrderIds.flatMap((id) => saleMap.get(id)!.order_line as number[]));
      let expectedBase = 0;
      for (const id of detail.invoiceLineIds) {
        const line = lineMap.get(id)!;
        assert.equal((line.move_id as [number, string])[0], detail.invoiceId);
        assert.equal(line.display_type, 'product');
        assert.equal(line.tax_line_id, false);
        assert.ok((line.sale_line_ids as number[]).every((saleLine) => allowedSaleLines.has(saleLine)));
        expectedBase += -Number(line.balance);
      }
      assert.equal(detail.netBase, roundCurrency(expectedBase));
      assert.equal(detail.bonus, calculatePlatformBonus(expectedBase));
      for (const id of detail.orderIds) {
        assert.equal(orderMap.get(id)?.empresa_id, detail.companyId);
        assert.ok(detail.saleOrderIds.includes(Number(orderMap.get(id)?.odoo_sale_order_id)));
      }
      if (detail.documentType === 'out_invoice') {
        assert.equal((invoice.invoice_user_id as [number, string])[0], result.advisor.odooUserId);
      }
    }
  }
  t.diagnostic(JSON.stringify({
    migrationApplied: input.migrationApplied,
    validation: input.migrationApplied ? 'esquema aplicado' : 'política aprobada para el backfill pendiente; no prueba de esquema aplicado',
    invoices: invoiceIds.length,
    lines: lineIds.length,
    base: roundCurrency(results.reduce((sum, result) => sum + result.totals.netBase, 0)),
    bonus: roundCurrency(results.reduce((sum, result) => sum + result.totals.bonus, 0)),
    blockingIssues: results.flatMap((result) => result.blockingIssues),
  }));
});

test('Odoo: consultar una asesora no cambia atribución ni expone resultados del equipo', async () => {
  const input = await realInput();
  const all = await realCalculation();
  const selected = all.find((result) => result.details.length > 0);
  assert.ok(selected, 'No hay una asesora con documentos reales para comparar.');
  const scoped = await calculateOdooPlatformBonuses({ ...input, advisorIds: [selected.advisor.id] });
  assert.deepEqual(scoped, [selected]);
  assert.equal(getPlatformBonusCalculationHash(scoped[0]), getPlatformBonusCalculationHash(selected));
  assert.equal(getPlatformBonusCalculationHash(selected), getPlatformBonusCalculationHash({
    ...selected, clients: [...selected.clients].reverse(), details: [...selected.details].reverse(),
  }));
});

test('048: las tablas existen y bloquean lectura anónima', async () => {
  const admin = getClient();
  const anon = getClient(false);
  for (const table of ['comision_periodos', 'comision_clientes', 'comision_detalles']) {
    const [internal, external] = await Promise.all([
      admin.from(table).select('id').limit(1),
      anon.from(table).select('id').limit(1),
    ]);
    assert.ifError(internal.error);
    assert.equal(external.error?.code, '42501');
  }
});

test('048: el calculador productivo usa elegibilidad real y mantiene la conciliación', async () => {
  const input = await realInput();
  assert.equal(input.migrationApplied, true, 'Aplica manualmente la migración 048 antes de esta prueba.');
  const production = await calculatePlatformBonuses({ admin: getClient(), period: input.period });
  const expected = await realCalculation();
  for (const result of expected) {
    const actual = production.find((row) => row.advisor.id === result.advisor.id);
    assert.ok(actual);
    assert.deepEqual(actual.totals, result.totals);
    assert.deepEqual(actual.details, result.details);
  }
});
