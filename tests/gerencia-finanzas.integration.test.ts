import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authenticate, read, searchCount, searchRead, type OdooSession } from '../src/lib/odoo/client';
import { getServerOdooConfig } from '../src/lib/odoo/serverConfig';
import { getBogotaCalendarDate, PLATFORM_BONUS_PERCENT, roundCurrency } from '../src/lib/comisiones/bonoPlataforma';
import {
  buildFinancialReport,
  defaultFinancialRange,
  filterFinancialLines,
  FINANCIAL_PAGE_SIZE,
  previousFinancialRange,
  regularCommissionRate,
  summarizeFinancialLines,
  validateFinancialRange,
  type FinancialFilters,
  type FinancialLine,
  type FinancialRange,
  type FinancialTotals,
} from '../src/lib/gerencia/finanzas';
import {
  getFinancialReport,
  loadFinancialDataset,
  normalizeFinancialLine,
  type FinancialDataset,
} from '../src/lib/gerencia/finanzas.server';

config({ path: '.env.local', quiet: true });

type Row = Record<string, unknown>;
const DAY_MS = 86_400_000;
const invoiceFields = [
  'id', 'name', 'state', 'move_type', 'invoice_date', 'invoice_user_id', 'commercial_partner_id',
  'partner_id', 'company_id', 'currency_id', 'company_currency_id', 'amount_untaxed',
  'amount_untaxed_signed', 'amount_tax_signed', 'amount_total_signed', 'margin_signed', 'cost_total',
];
const lineFields = [
  'id', 'move_id', 'name', 'display_type', 'tax_line_id', 'product_id', 'product_uom_id',
  'quantity', 'balance', 'price_subtotal', 'purchase_price', 'margin', 'margin_signed', 'sale_line_ids',
];

function relationId(value: unknown): number | null {
  return Array.isArray(value) && typeof value[0] === 'number' ? value[0] : null;
}

function numeric(value: unknown): number {
  assert.ok(typeof value === 'number' && Number.isFinite(value), 'Odoo debe confirmar un valor numérico finito.');
  return value;
}

function getReadonlyAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, 'Faltan variables Supabase para las pruebas de solo lectura.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        assert.ok(method === 'GET' || method === 'HEAD', 'La prueba bloquea cualquier mutación Supabase.');
        return fetch(input, init);
      },
    },
  });
}

async function readChunks(session: OdooSession, model: string, ids: number[], fields: string[]): Promise<Row[]> {
  const unique = [...new Set(ids)];
  const result: Row[] = [];
  for (let offset = 0; offset < unique.length; offset += 500) {
    const batch = unique.slice(offset, offset + 500);
    const rows = await read(model, batch, fields, session);
    assert.deepEqual(rows.map((row) => numeric(row.id)).sort((a, b) => a - b), [...batch].sort((a, b) => a - b));
    result.push(...rows);
  }
  return result;
}

async function boundedSearch(session: OdooSession, model: string, domain: unknown[], fields: string[], maximum: number): Promise<Row[]> {
  const rows: Row[] = [];
  let lastId = 0;
  for (;;) {
    const page = await searchRead(model, [...domain, ['id', '>', lastId]], fields, { session, limit: 1000, order: 'id asc' });
    for (const row of page) {
      const id = numeric(row.id);
      assert.ok(id > lastId, `La paginación real de ${model} debe avanzar sin repetir IDs.`);
      lastId = id;
      rows.push(row);
    }
    assert.ok(rows.length <= maximum, `Se alcanzó el límite de lectura de ${model}; no se aceptan totales parciales.`);
    if (page.length < 1000) return rows;
  }
}

async function readBonusSnapshot(admin: SupabaseClient) {
  const tables: Record<string, { count: number; hash: string }> = {};
  const states: Record<string, number> = {};
  for (const table of ['comision_periodos', 'comision_clientes', 'comision_detalles']) {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      assert.ok(offset < 10_000, 'La verificación del bono supera el límite de lectura; requiere una revisión acotada.');
      const { data, error } = await admin.from(table).select('*').order('id').range(offset, offset + 499);
      assert.ifError(error);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) break;
    }
    tables[table] = { count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    if (table === 'comision_periodos') {
      for (const row of rows) {
        assert.equal(Number(row.porcentaje_bono), 0.5);
        const state = String(row.estado);
        states[state] = (states[state] ?? 0) + 1;
      }
    }
  }
  return { tables, states };
}

async function loadIndependentRows(session: OdooSession, dataset: FinancialDataset, range: FinancialRange) {
  const previous = previousFinancialRange(range);
  const invoiceDomain = [
    ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['invoice_date', '>=', previous.from], ['invoice_date', '<=', range.to],
  ];
  const [invoices, categories, namedCategories] = await Promise.all([
    boundedSearch(session, 'account.move', invoiceDomain, invoiceFields, 10_000),
    boundedSearch(session, 'product.category', [['id', 'child_of', 26]], ['id', 'name', 'parent_id'], 10_000),
    readChunks(session, 'product.category', [25, 26], ['id', 'name', 'parent_id']),
  ]);
  const lineDomain = [['move_id', 'in', invoices.map((row) => numeric(row.id))], ['display_type', '=', 'product']];
  const [invoiceCount, lineCount, rawLines, products] = await Promise.all([
    searchCount('account.move', invoiceDomain, session),
    searchCount('account.move.line', lineDomain, session),
    readChunks(session, 'account.move.line', dataset.lines.map((line) => line.id), lineFields),
    readChunks(session, 'product.product', dataset.lines.flatMap((line) => line.productId === null ? [] : [line.productId]), ['id', 'default_code', 'categ_id']),
  ]);
  assert.equal(invoices.length, invoiceCount, 'La consulta independiente no debe omitir cabeceras.');
  assert.ok(lineCount <= 100_000, 'El rango real supera el máximo de líneas admitido.');
  assert.equal(dataset.lines.length, lineCount, 'El dataset debe contener todas las líneas de producto, no solo la primera página.');
  return {
    invoices,
    rawLines,
    namedCategories,
    invoiceById: new Map(invoices.map((row) => [numeric(row.id), row])),
    lineById: new Map(rawLines.map((row) => [numeric(row.id), row])),
    productById: new Map(products.map((row) => [numeric(row.id), row])),
    genericIds: new Set(categories.map((row) => numeric(row.id))),
  };
}

function assertTotals(totals: FinancialTotals, lines: FinancialLine[]) {
  const sum = (values: number[]) => roundCurrency(values.reduce((total, value) => total + value, 0));
  const invoices = lines.filter((line) => line.documentType === 'out_invoice');
  const refunds = lines.filter((line) => line.documentType === 'out_refund');
  const costKnown = lines.filter((line) => line.cost !== null && line.profit !== null);
  const missingCosts = lines.length - costKnown.length;
  const missingCommissions = lines.filter((line) => line.commission === null).length;
  assert.equal(totals.netSales, sum(lines.map((line) => line.netSales)));
  assert.equal(totals.invoicedSales, sum(invoices.map((line) => line.netSales)));
  assert.equal(totals.creditNotes, sum(refunds.map((line) => line.netSales)));
  assert.equal(totals.invoiceCount, new Set(invoices.map((line) => line.invoiceId)).size);
  assert.equal(totals.creditNoteCount, new Set(refunds.map((line) => line.invoiceId)).size);
  assert.equal(totals.clientCount, new Set(lines.flatMap((line) => line.clientId === null ? [] : [line.clientId])).size);
  assert.equal(totals.lineCount, lines.length);
  assert.equal(totals.missingCostLines, missingCosts);
  assert.equal(totals.knownCost, sum(costKnown.map((line) => line.cost!)));
  assert.equal(totals.verifiedProfit, sum(costKnown.map((line) => line.profit!)));
  assert.equal(totals.cost, missingCosts ? null : totals.knownCost);
  assert.equal(totals.profit, missingCosts ? null : totals.verifiedProfit);
  assert.equal(totals.marginPercent, totals.profit === null || totals.netSales <= 0 ? null : roundCurrency(totals.profit / totals.netSales * 100));
  assert.equal(totals.missingCommissionLines, missingCommissions);
  assert.equal(totals.knownCommission, sum(lines.flatMap((line) => line.commission === null ? [] : [line.commission])));
  assert.equal(totals.commission, missingCommissions ? null : totals.knownCommission);
  assert.equal(totals.averageInvoice, totals.invoiceCount ? roundCurrency(totals.invoicedSales / totals.invoiceCount) : null);
  const absoluteSales = lines.reduce((total, line) => total + Math.abs(line.netSales), 0);
  const coveredSales = costKnown.reduce((total, line) => total + Math.abs(line.netSales), 0);
  assert.equal(totals.costCoveragePercent, lines.length ? (absoluteSales ? roundCurrency(coveredSales / absoluteSales * 100) : missingCosts ? 0 : 100) : null);
}

test('Gerencia: Odoo y Supabase reales, lecturas acotadas y bono sin mutaciones', { timeout: 600_000 }, async (t) => {
  const admin = getReadonlyAdmin();
  const odooConfig = await getServerOdooConfig();
  assert.ok(odooConfig, 'Falta la configuración autoritativa real de Odoo.');
  const session = await authenticate(odooConfig);
  const today = getBogotaCalendarDate();
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  const range = validateFinancialRange(new Date(Date.parse(`${yesterday}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10), yesterday);
  const previous = previousFinancialRange(range);
  t.diagnostic(`Conciliación de siete días completos hasta ${yesterday}; la facturación de hoy se mantiene fuera de las lecturas comparativas.`);
  const before = await readBonusSnapshot(admin);
  try {
    await t.test('normalización de la NC real 269551, línea 922982: cantidad, costo y comisión con signo de devolución', async () => {
      const [invoices, rawLines, products, genericCategories] = await Promise.all([
        readChunks(session, 'account.move', [269551], invoiceFields),
        readChunks(session, 'account.move.line', [922982], lineFields),
        readChunks(session, 'product.product', [2003], ['id', 'default_code', 'categ_id']),
        boundedSearch(session, 'product.category', [['id', 'child_of', 26]], ['id'], 10_000),
      ]);
      const invoice = invoices[0];
      const raw = rawLines[0];
      const product = products[0];
      assert.equal(invoice.state, 'posted');
      assert.equal(invoice.move_type, 'out_refund');
      assert.equal(invoice.invoice_date, '2026-09-04');
      assert.equal(relationId(invoice.currency_id), 8);
      assert.equal(relationId(invoice.company_currency_id), 8);
      assert.equal(relationId(invoice.company_id), 1);
      assert.equal(relationId(invoice.invoice_user_id), 9);
      assert.equal(relationId(raw.move_id), 269551);
      assert.equal(relationId(raw.product_id), 2003);
      assert.equal(raw.quantity, 11);
      assert.equal(raw.price_subtotal, 187000);
      assert.equal(raw.balance, 187000);
      assert.equal(raw.purchase_price, 13445);
      assert.equal(raw.margin, 39105);
      assert.equal(raw.margin_signed, -39105);
      assert.equal(product.default_code, '2100100012');
      const genericIds = new Set(genericCategories.map((row) => numeric(row.id)));
      const categoryId = relationId(product.categ_id);
      assert.ok(categoryId !== null);
      assert.equal(genericIds.has(categoryId), false);
      const normalized = normalizeFinancialLine({ ...invoice, companyCurrencyId: relationId(invoice.company_currency_id) }, raw, product, genericIds, new Set(), null);
      assert.equal(normalized.id, 922982);
      assert.equal(normalized.invoiceId, 269551);
      assert.equal(normalized.quantity, -11);
      assert.equal(normalized.netSales, -187000);
      assert.equal(normalized.cost, -147895);
      assert.equal(normalized.profit, -39105);
      assert.equal(normalized.marginPercent, null);
      assert.equal(normalized.commissionRate, 1);
      assert.equal(normalized.commission, -1870);
      assert.equal(normalized.categoryId, categoryId);
      assert.equal(normalized.sku, product.default_code);
      assertTotals(summarizeFinancialLines([normalized]), [normalized]);
      assert.throws(() => buildFinancialReport([normalized, normalized], { from: '2026-09-04', to: '2026-09-04' }, { page: 1 }, new Date().toISOString()), /duplicada/);
    });

    const dataset = await loadFinancialDataset(admin, range, false);
    assert.ok(dataset.lines.length > 0, 'No hay líneas reales en los últimos siete días completos y su comparativo para validar importes.');
    const independent = await loadIndependentRows(session, dataset, range);
    const current = dataset.lines.filter((line) => line.invoiceDate >= range.from && line.invoiceDate <= range.to);
    const old = dataset.lines.filter((line) => line.invoiceDate >= previous.from && line.invoiceDate <= previous.to);
    const report = buildFinancialReport(dataset.lines, range, { page: 1 }, dataset.generatedAt, dataset.warnings);

    await t.test('rango predeterminado hasta hoy Bogotá y comparativo UTC equivalente sin solapamiento', () => {
      const defaults = defaultFinancialRange(today);
      assert.deepEqual(defaults, { from: `${today.slice(0, 7)}-01`, to: today });
      assert.deepEqual(validateFinancialRange(defaults.from, defaults.to), defaults);
      assert.deepEqual(report.range, range);
      assert.deepEqual(report.previousRange, previous);
      assert.equal(Date.parse(`${range.from}T00:00:00Z`) - Date.parse(`${previous.to}T00:00:00Z`), DAY_MS);
      assert.equal((Date.parse(`${previous.to}T00:00:00Z`) - Date.parse(`${previous.from}T00:00:00Z`)) / DAY_MS + 1, 7);
      assert.equal(current.length + old.length, dataset.lines.length);
      assertTotals(report.totals, current);
      assertTotals(report.previousTotals, old);
    });

    await t.test('conciliación independiente: todas las cabeceras publicadas, COP y base contable sin IVA', () => {
      assert.equal(new Set(dataset.lines.map((line) => line.id)).size, dataset.lines.length);
      for (const line of dataset.lines) {
        const raw = independent.lineById.get(line.id)!;
        const invoice = independent.invoiceById.get(line.invoiceId)!;
        assert.ok(raw && invoice);
        assert.equal(raw.display_type, 'product');
        assert.equal(raw.tax_line_id, false);
        assert.equal(relationId(raw.move_id), line.invoiceId);
        assert.equal(invoice.state, 'posted');
        assert.equal(line.documentType, invoice.move_type);
        assert.equal(line.invoiceDate, invoice.invoice_date);
        assert.equal(line.companyId, relationId(invoice.company_id));
        assert.equal(line.advisorId, relationId(invoice.invoice_user_id));
        assert.equal(line.clientId, relationId(invoice.commercial_partner_id) ?? relationId(invoice.partner_id));
        assert.equal(line.productId, relationId(raw.product_id));
        assert.equal(line.unitId, relationId(raw.product_uom_id));
        assert.equal((invoice.company_currency_id as [number, string])[1], 'COP');
        assert.equal(line.netSales, roundCurrency(-numeric(raw.balance)));
        assert.equal(line.quantity, numeric(raw.quantity) * (invoice.move_type === 'out_refund' ? -1 : 1));
        assert.ok(line.invoiceDate >= previous.from && line.invoiceDate <= range.to);
      }
      for (const invoice of independent.invoices) {
        const lines = dataset.lines.filter((line) => line.invoiceId === invoice.id);
        const net = roundCurrency(lines.reduce((total, line) => total + line.netSales, 0));
        const tolerance = Math.max(0.05, lines.length * 0.01);
        assert.ok(Math.abs(net - numeric(invoice.amount_untaxed_signed)) <= tolerance, `No concilia la cabecera Odoo ${invoice.id}.`);
        assert.ok(Math.abs(numeric(invoice.amount_total_signed) - numeric(invoice.amount_tax_signed) - numeric(invoice.amount_untaxed_signed)) <= tolerance);
      }
      t.diagnostic(JSON.stringify({ range, previous, invoices: independent.invoices.length, lines: dataset.lines.length, currentLines: current.length, netSales: report.totals.netSales, creditNotes: report.totals.creditNotes }));
    });

    await t.test('categorías reales: 26 y descendientes al 2%; 25 y todas las otras al 1%, por línea mixta', () => {
      assert.deepEqual(independent.namedCategories.map((row) => numeric(row.id)).sort((a, b) => a - b), [25, 26]);
      assert.equal(independent.genericIds.has(26), true);
      assert.equal(independent.genericIds.has(25), false);
      for (const id of independent.genericIds) assert.equal(regularCommissionRate(id, independent.genericIds), 2);
      assert.equal(regularCommissionRate(25, independent.genericIds), 1);
      const counts = { generic: 0, other: 0, unidentified: 0, refunds: 0 };
      for (const line of dataset.lines) {
        const product = line.productId === null ? undefined : independent.productById.get(line.productId);
        const categoryId = product ? relationId(product.categ_id) : null;
        const rate = categoryId === null ? null : independent.genericIds.has(categoryId) ? 2 : 1;
        assert.equal(line.categoryId, categoryId);
        assert.equal(line.commissionRate, rate);
        assert.equal(line.commission, rate === null || line.advisorId === null ? null : roundCurrency(-numeric(independent.lineById.get(line.id)!.balance) * rate / 100));
        counts[rate === 2 ? 'generic' : rate === 1 ? 'other' : 'unidentified']++;
        if (line.documentType === 'out_refund') counts.refunds++;
      }
      const ratesByInvoice = new Map<number, Set<number | null>>();
      for (const line of dataset.lines) {
        const rates = ratesByInvoice.get(line.invoiceId) ?? new Set();
        rates.add(line.commissionRate);
        ratesByInvoice.set(line.invoiceId, rates);
      }
      t.diagnostic(JSON.stringify({ ...counts, genericCategoryCount: independent.genericIds.size, mixedInvoices: [...ratesByInvoice.values()].filter((rates) => rates.has(1) && rates.has(2)).length }));
    });

    await t.test('clientes, asesoras, productos y tendencia suman exclusivamente sus líneas reales', () => {
      for (const [groups, select] of [
        [report.clients, (line: FinancialLine) => String(line.clientId ?? 'none')],
        [report.advisors, (line: FinancialLine) => String(line.advisorId ?? 'none')],
        [report.products, (line: FinancialLine) => `${line.productId ?? 'none'}:${line.unitId ?? 'none'}`],
      ] as const) {
        assert.equal(groups.length, new Set(current.map(select)).size);
        assert.equal(roundCurrency(groups.reduce((sum, group) => sum + group.netSales, 0)), report.totals.netSales);
        assert.equal(groups.reduce((sum, group) => sum + group.lineCount, 0), current.length);
        assert.equal(roundCurrency(groups.reduce((sum, group) => sum + group.knownCommission, 0)), report.totals.knownCommission);
        for (const group of groups) assertTotals(group, current.filter((line) => select(line) === group.key));
      }
      for (const group of report.products) {
        const rows = current.filter((line) => `${line.productId ?? 'none'}:${line.unitId ?? 'none'}` === group.key);
        assert.equal(group.quantity, roundCurrency(rows.reduce((sum, line) => sum + line.quantity, 0)));
        assert.equal(group.sku, rows[0].sku);
      }
      assert.deepEqual(report.trend.map((point) => point.date), [...new Set(current.map((line) => line.invoiceDate))].sort());
      for (const point of report.trend) {
        const totals = summarizeFinancialLines(current.filter((line) => line.invoiceDate === point.date));
        assert.equal(point.netSales, totals.netSales);
        assert.equal(point.profit, totals.profit);
        assert.equal(point.commission, totals.commission);
      }
    });

    await t.test('costos cero o ausentes impiden margen validado; costos actuales se comparan solo en una muestra', async (subtest) => {
      const unavailable = dataset.lines.filter((line) => {
        const price = independent.lineById.get(line.id)!.purchase_price;
        return typeof price !== 'number' || !Number.isFinite(price) || price <= 0;
      });
      if (!unavailable.length) subtest.diagnostic('El rango real no contiene costos cero o ausentes; no se fabricaron filas para esa condición.');
      for (const line of unavailable) {
        assert.equal(line.cost, null);
        assert.equal(line.profit, null);
        assert.equal(line.marginPercent, null);
        assert.ok(line.issues.length > 0);
      }
      for (const line of dataset.lines) {
        if (line.cost === null || line.profit === null) {
          assert.equal(line.cost, null);
          assert.equal(line.profit, null);
          assert.equal(line.marginPercent, null);
          assert.ok(line.issues.length > 0);
          continue;
        }
        const raw = independent.lineById.get(line.id)!;
        const invoice = independent.invoiceById.get(line.invoiceId)!;
        const sign = invoice.move_type === 'out_refund' ? -1 : 1;
        const conversion = relationId(invoice.currency_id) === relationId(invoice.company_currency_id) ? 1 : numeric(invoice.amount_untaxed_signed) / (sign * numeric(invoice.amount_untaxed));
        assert.equal(line.cost, roundCurrency(sign * numeric(raw.quantity) * numeric(raw.purchase_price) * conversion));
        assert.equal(line.profit, roundCurrency(line.netSales - line.cost));
      }
      if (unavailable.length) {
        const totals = summarizeFinancialLines(unavailable);
        assert.equal(totals.cost, null);
        assert.equal(totals.profit, null);
        assert.equal(totals.marginPercent, null);
        assert.equal(totals.costCoveragePercent, 0);
        assert.equal(totals.missingCostLines, unavailable.length);
      }
      const sampleIds = [...new Set(dataset.lines.flatMap((line) => line.productId === null ? [] : [line.productId]))].slice(0, 8);
      const currentProducts = await readChunks(session, 'product.product', sampleIds, ['id', 'standard_price']);
      let historicalDifferences = 0;
      for (const product of currentProducts) {
        const line = dataset.lines.find((row) => row.productId === product.id)!;
        const raw = independent.lineById.get(line.id)!;
        if (typeof raw.purchase_price === 'number' && typeof product.standard_price === 'number' && roundCurrency(raw.purchase_price) !== roundCurrency(product.standard_price)) historicalDifferences++;
      }
      subtest.diagnostic(JSON.stringify({ missingOrZeroCostLines: unavailable.length, validatedCostLines: dataset.lines.filter((line) => line.cost !== null).length, currentCostSampleOnly: currentProducts.length, historicalDifferences }));
    });

    await t.test('filtros por vendedor, cliente, producto y factura conservan intersección y comparación anterior', () => {
      const selected = current.find((line) => line.clientId !== null && line.productId !== null);
      assert.ok(selected, 'No hay una línea actual con cliente y producto reales para verificar los filtros.');
      const filters: FinancialFilters[] = [
        { advisorId: selected.advisorId, page: 1 },
        { advisorId: null, page: 1 },
        { clientId: selected.clientId!, page: 1 },
        { productId: selected.productId!, page: 1 },
        { invoiceId: selected.invoiceId, page: 1 },
        { advisorId: selected.advisorId, clientId: selected.clientId!, productId: selected.productId!, invoiceId: selected.invoiceId, page: 1 },
      ];
      for (const filter of filters) {
        const expected = dataset.lines.filter((line) =>
          (filter.advisorId === undefined || line.advisorId === filter.advisorId)
          && (filter.clientId === undefined || line.clientId === filter.clientId)
          && (filter.productId === undefined || line.productId === filter.productId)
          && (filter.invoiceId === undefined || line.invoiceId === filter.invoiceId));
        assert.deepEqual(filterFinancialLines(dataset.lines, filter), expected);
        const filtered = buildFinancialReport(dataset.lines, range, filter, dataset.generatedAt);
        assertTotals(filtered.totals, expected.filter((line) => line.invoiceDate >= range.from && line.invoiceDate <= range.to));
        assertTotals(filtered.previousTotals, expected.filter((line) => line.invoiceDate >= previous.from && line.invoiceDate <= previous.to));
        assert.ok(filtered.lines.every((line) => expected.includes(line)));
      }
    });

    await t.test('paginación del informe: cobertura completa, orden estable, sin repetidos ni cambios de totales', () => {
      const allPages: FinancialLine[] = [];
      for (let page = 1; page <= report.pagination.totalPages; page++) {
        const paged = buildFinancialReport(dataset.lines, range, { page }, dataset.generatedAt);
        assert.equal(paged.pagination.page, page);
        assert.ok(paged.lines.length <= FINANCIAL_PAGE_SIZE);
        assert.deepEqual(paged.totals, report.totals);
        assert.deepEqual(paged.previousTotals, report.previousTotals);
        allPages.push(...paged.lines);
      }
      const ordered = [...current].sort((left, right) => right.invoiceDate.localeCompare(left.invoiceDate) || right.invoiceId - left.invoiceId || left.id - right.id);
      assert.deepEqual(allPages.map((line) => line.id), ordered.map((line) => line.id));
      assert.equal(new Set(allPages.map((line) => line.id)).size, current.length);
      assert.equal(report.pagination.total, current.length);
      const beyond = buildFinancialReport(dataset.lines, range, { page: report.pagination.totalPages + 1 }, dataset.generatedAt);
      assert.equal(beyond.pagination.page, report.pagination.totalPages);
      assert.throws(() => buildFinancialReport([...dataset.lines, dataset.lines[0]], range, { page: 1 }, dataset.generatedAt), /duplicada/);
      t.diagnostic(JSON.stringify({ reportPages: report.pagination.totalPages, odooLineBatches: Math.ceil(dataset.lines.length / 500) }));
    });

    await t.test('getFinancialReport sin caché coincide con el dataset y su filtro real, sin recalcular liquidaciones', async () => {
      const selected = current.find((line) => line.advisorId !== null);
      assert.ok(selected, 'No hay una asesora Odoo real en el periodo para verificar el servicio.');
      const filters = { advisorId: selected.advisorId, page: 1 };
      const actual = await getFinancialReport(admin, range, filters, false);
      const expected = buildFinancialReport(dataset.lines, range, filters, actual.generatedAt, dataset.warnings);
      expected.selectedAdvisor = dataset.advisors.find((advisor) => advisor.id === selected.advisorId) ?? null;
      assert.deepEqual(actual, expected, 'Los datos reales cambiaron durante la lectura o el servicio devuelve un reporte inconsistente.');
      assert.equal(actual.currency, 'COP');
      assert.equal(PLATFORM_BONUS_PERCENT, 0.5);
      const another = current.find((line) => line.advisorId !== selected.advisorId);
      if (another) {
        const empty = await getFinancialReport(admin, range, { ...filters, invoiceId: another.invoiceId });
        assert.equal(empty.totals.lineCount, 0);
        assert.deepEqual(empty.selectedAdvisor, actual.selectedAdvisor, 'La identidad del bono no debe desaparecer al filtrar sin resultados.');
      }
    });
  } finally {
    await t.test('Supabase: snapshots, detalles, estados, versiones y bono 0,5% idénticos antes/después de consultar', async (subtest) => {
      const after = await readBonusSnapshot(admin);
      assert.deepEqual(after, before, 'Cambió el estado persistido del bono durante la lectura; no se ejecutó ninguna RPC de liquidación.');
      subtest.diagnostic(JSON.stringify({ rows: Object.fromEntries(Object.entries(after.tables).map(([table, summary]) => [table, summary.count])), states: after.states, persistedSnapshotsAvailable: (after.states.cerrado ?? 0) + (after.states.pagado ?? 0) > 0 }));
    });
  }
});
