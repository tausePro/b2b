import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getStoredOdooConfig } from '../src/lib/odoo/serverConfig';
import {
  authenticate, getProductVariants, getProductos, getProductosByPricelist, loadPricelistRuleSet, read,
  resolvePricelistPrice, searchRead, type OdooPricelistItem,
} from '../src/lib/odoo/client';
import { getPricelistVariantIds, matchesCatalogProductSearch } from '../src/lib/pricing/catalog-visibility';
import { loadPricingContext, resolveProductPrice } from '../src/lib/pricing/margins';
import { buildVariantAttributeMap } from '../src/lib/odoo/variant-attributes';

config({ path: '.env.local', quiet: true });

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.endsWith('/xmlrpc/2/object')) {
    const params = [...String(init?.body).matchAll(/<param>([\s\S]*?)<\/param>/g)];
    const method = params[4]?.[1].match(/<string>(.*?)<\/string>/)?.[1];
    assert.ok(method && ['read', 'search_read', 'search_count', 'fields_get'].includes(method), 'Solo lecturas Odoo.');
  } else if (!url.pathname.endsWith('/xmlrpc/2/common')) {
    assert.ok(['GET', 'HEAD'].includes((init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()), 'Solo lecturas Supabase.');
  }
  return originalFetch(input, init);
};
after(() => { globalThis.fetch = originalFetch; });

function activeAt(item: OdooPricelistItem, at: Date): boolean {
  const date = (value: string) => Date.parse(`${value.replace(' ', 'T')}Z`);
  return (!item.date_start || date(item.date_start) <= at.getTime())
    && (!item.date_end || date(item.date_end) >= at.getTime());
}

async function loadFixture() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        assert.ok(['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase()), 'Solo lecturas Supabase.');
        return fetch(input, init);
      },
    },
  });
  const company = await admin.from('empresas').select('id,odoo_partner_id')
    .eq('nombre', 'ARIS MINING SEGOVIA').single();
  assert.ifError(company.error);
  const storedConfig = await getStoredOdooConfig();
  assert.ok(storedConfig, 'Debe usarse la configuración Odoo almacenada en Supabase.');
  const session = await authenticate(storedConfig);
  const [partner] = await read('res.partner', [company.data!.odoo_partner_id], ['property_product_pricelist'], session);
  assert.ok(Array.isArray(partner.property_product_pricelist));
  const pricelistId = Number(partner.property_product_pricelist[0]);
  const reported = await searchRead('product.product', [['default_code', 'in', ['1000400203', '1000400014']]],
    ['id', 'product_tmpl_id'], { session, context: { active_test: false } });
  assert.equal(reported.length, 2);
  const templateId = Number((reported[0].product_tmpl_id as [number, string])[0]);
  assert.ok(reported.every(row => (row.product_tmpl_id as [number, string])[0] === templateId));
  const [template] = await read('product.template', [templateId], ['name', 'categ_id', 'product_variant_count'], session);
  const categoryId = Number((template.categ_id as [number, string])[0]);
  const allItems = await searchRead('product.pricelist.item', [
    ['pricelist_id', '=', pricelistId],
  ], ['id', 'applied_on', 'product_tmpl_id', 'product_id', 'categ_id', 'date_start', 'date_end', 'compute_price', 'fixed_price', 'min_quantity'],
  { session, limit: 10000 }) as unknown as OdooPricelistItem[];
  assert.ok(allItems.length > 0 && allItems.length < 10000);
  const now = new Date();
  const tariffItems = allItems.filter(item => activeAt(item, now));
  const activeVariants = await searchRead('product.product', [
    ['product_tmpl_id', '=', templateId], ['active', '=', true], ['sale_ok', '=', true],
  ], ['id', 'default_code', 'lst_price', 'standard_price', 'product_template_attribute_value_ids'], { session });
  const allowedIds = activeVariants.filter(variant => tariffItems.some(item =>
    item.applied_on === '3_global'
    || (item.applied_on === '2_product_category' && item.categ_id && item.categ_id[0] === categoryId)
    || (item.applied_on === '1_product' && item.product_tmpl_id && item.product_tmpl_id[0] === templateId)
    || (item.applied_on === '0_product_variant' && item.product_id && item.product_id[0] === variant.id),
  )).map(variant => Number(variant.id));
  const rules = await loadPricelistRuleSet(session, pricelistId, now);
  const pricing = await loadPricingContext(company.data!.id);
  assert.equal(pricing.modoPricing, 'pricelist');
  return { session, pricelistId, templateId, categoryId, template, allItems, tariffItems, activeVariants, allowedIds, rules, pricing, reported };
}

let fixture: ReturnType<typeof loadFixture> | undefined;
const current = () => fixture ??= loadFixture();

test('ARIS: el selector solo devuelve las variantes asignadas en su tarifa vigente', async () => {
  const { session, templateId, categoryId, rules, allowedIds } = await current();
  const active = await searchRead('product.product', [
    ['id', 'in', allowedIds], ['active', '=', true], ['sale_ok', '=', true],
  ], ['id'], { session });
  const result = await getProductVariants(session, templateId, getPricelistVariantIds(rules, templateId, categoryId) ?? undefined);
  assert.deepEqual(result.variants.map(row => row.id).sort((a, b) => a - b),
    active.map(row => Number(row.id)).sort((a, b) => a - b));
  const visibleValues = new Set(result.variants.flatMap(row => row.product_template_attribute_value_ids));
  assert.ok(result.attributes.every(attribute => attribute.values.every(value => visibleValues.has(value.ptavId))));
});

test('la consulta comercial identifica los atributos reales de cada variante por su PTAV', async () => {
  const { session, templateId, categoryId, rules } = await current();
  const result = await getProductVariants(session, templateId, getPricelistVariantIds(rules, templateId, categoryId) ?? undefined);
  const labels = buildVariantAttributeMap(result.attributes);
  const ptavIds = [...new Set(result.variants.flatMap(variant => variant.product_template_attribute_value_ids))];
  assert.ok(ptavIds.length > 0);
  const expected = await read('product.template.attribute.value', ptavIds, ['id', 'name', 'attribute_id', 'html_color'], session);
  for (const value of expected) {
    assert.deepEqual(labels.get(Number(value.id)), {
      attrName: (value.attribute_id as [number, string])[1],
      valueName: value.name,
      color: typeof value.html_color === 'string' ? value.html_color : null,
    });
  }
  assert.equal(labels.size, ptavIds.length);
});

test('ARIS: catálogo y buscador usan los SKU vigentes sin saltarse la selección de variante', async () => {
  const { session, pricelistId, templateId, template, activeVariants, allowedIds, reported } = await current();
  const catalog = await getProductosByPricelist(session, pricelistId, { limit: 500 });
  const product = catalog.find(row => row.id === templateId);
  assert.ok(product);
  assert.equal(product.product_variant_count, template.product_variant_count);
  const codes = activeVariants.filter(row => allowedIds.includes(Number(row.id))).map(row => String(row.default_code));
  assert.deepEqual([...product.pricelist_variant_codes!].sort(), [...codes].sort());
  for (const code of codes) assert.equal(matchesCatalogProductSearch(product, code), true);
  for (const reportedVariant of reported) {
    const variant = activeVariants.find(row => row.id === reportedVariant.id);
    if (variant) assert.equal(matchesCatalogProductSearch(product, String(variant.default_code)), allowedIds.includes(Number(variant.id)));
  }
});

test('ARIS: buscar una referencia de variante conserva exclusivamente su tarifa', async () => {
  const { session, pricelistId, templateId, activeVariants, allowedIds, reported } = await current();
  const allowed = activeVariants.find(row => allowedIds.includes(Number(row.id)) && row.default_code);
  assert.ok(allowed);
  const found = await getProductosByPricelist(session, pricelistId, { search: String(allowed.default_code) });
  assert.ok(found.some(row => row.id === templateId));
  for (const reportedVariant of reported) {
    const variant = activeVariants.find(row => row.id === reportedVariant.id);
    if (!variant || allowedIds.includes(Number(variant.id))) continue;
    const result = await getProductosByPricelist(session, pricelistId, { search: String(variant.default_code) });
    assert.equal(result.length, 0, 'Una referencia excluida no puede recuperar el producto por otro SKU de la familia.');
  }
});

test('ARIS: las variantes permitidas conservan sus precios fijos y sus overrides explícitos', async () => {
  const { templateId, categoryId, tariffItems, activeVariants, allowedIds, rules, pricing } = await current();
  for (const variant of activeVariants.filter(row => allowedIds.includes(Number(row.id)))) {
    const candidates = tariffItems.filter(item => item.applied_on === '0_product_variant'
      && item.product_id && item.product_id[0] === variant.id && item.min_quantity <= 1);
    const expected = candidates.sort((a, b) => b.min_quantity - a.min_quantity || b.id - a.id)[0];
    assert.ok(expected && expected.compute_price === 'fixed');
    const price = resolvePricelistPrice(rules, {
      templateId, variantId: Number(variant.id), categId: categoryId, basePrice: Number(variant.lst_price),
    });
    assert.equal(price, expected.fixed_price);
    assert.equal(resolveProductPrice(pricing, {
      id: templateId, list_price: price!, standard_price: Number(variant.standard_price), categ_id: [categoryId, ''],
    }), pricing.overrides.get(templateId) ?? expected.fixed_price);
  }
});

test('ARIS: todas las fichas corresponden a productos vendibles con alguna regla vigente', async () => {
  const { session, pricelistId, tariffItems } = await current();
  const templateIds = tariffItems.filter(item => item.applied_on === '1_product' && item.product_tmpl_id)
    .map(item => (item.product_tmpl_id as [number, string])[0]);
  const variantIds = tariffItems.filter(item => item.applied_on === '0_product_variant' && item.product_id)
    .map(item => (item.product_id as [number, string])[0]);
  const categories = tariffItems.filter(item => item.applied_on === '2_product_category' && item.categ_id)
    .map(item => (item.categ_id as [number, string])[0]);
  const domain: unknown[] = [['active', '=', true], ['sale_ok', '=', true]];
  if (!tariffItems.some(item => item.applied_on === '3_global')) {
    domain.push('|', '|', ['id', 'in', variantIds], ['product_tmpl_id', 'in', templateIds], ['categ_id', 'in', categories]);
  }
  const variants = await searchRead('product.product', domain, ['product_tmpl_id'], { session });
  const parentIds = [...new Set(variants.map(row => Number((row.product_tmpl_id as [number, string])[0])))];
  const templates = await searchRead('product.template', [
    ['id', 'in', parentIds], ['active', '=', true], ['sale_ok', '=', true],
  ], ['id'], { session });
  assert.ok(templates.length < 500);
  const catalog = await getProductosByPricelist(session, pricelistId, { limit: 500 });
  assert.deepEqual(catalog.map(row => row.id).sort((a, b) => a - b),
    templates.map(row => Number(row.id)).sort((a, b) => a - b));
});

test('una asignación explícita vacía no abre todas las variantes de la familia', async () => {
  const { session, templateId } = await current();
  assert.deepEqual(await getProductVariants(session, templateId, []), { variants: [], attributes: [] });
});

test('la exclusión es por cliente: el SKU sigue localizable en el catálogo general de Odoo', async () => {
  const { session, templateId, reported, activeVariants } = await current();
  for (const row of reported) {
    const variant = activeVariants.find(item => item.id === row.id);
    if (!variant) continue;
    const products = await getProductos(session, { search: String(variant.default_code), limit: 50 });
    assert.ok(products.some(product => product.id === templateId));
  }
});

test('ARIS: la vigencia excluye las reglas que todavía no comenzaron o ya terminaron', async () => {
  const { session, pricelistId, allItems } = await current();
  const starts = allItems.flatMap(item => item.date_start ? [Date.parse(`${item.date_start.replace(' ', 'T')}Z`)] : []);
  const ends = allItems.flatMap(item => item.date_end ? [Date.parse(`${item.date_end.replace(' ', 'T')}Z`)] : []);
  assert.ok(starts.length && ends.length);
  for (const at of [new Date(Math.min(...starts) - 1000), new Date(Math.max(...ends) + 1000)]) {
    const rules = await loadPricelistRuleSet(session, pricelistId, at);
    const loaded = [...rules.byVariant.values(), ...rules.byTemplate.values(), ...rules.byCategory.values(), rules.global].flat();
    assert.deepEqual(loaded.map(row => row.id).sort((a, b) => a - b),
      allItems.filter(item => activeAt(item, at)).map(row => row.id).sort((a, b) => a - b));
  }
});
