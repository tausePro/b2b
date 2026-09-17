import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPAQUES_CANONICAL_ORIGIN,
  buildEmpaquesBreadcrumbJsonLd,
  buildEmpaquesHomeCanonical,
  buildEmpaquesPersonalizadosCanonical,
  buildEmpaquesProductCanonical,
  buildEmpaquesProductJsonLd,
  buildEmpaquesWebSiteJsonLd,
  getEmpaquesProductSeoDescription,
  jsonLdScriptProps,
} from '../src/lib/empaques/seo';

const baseProduct = {
  id: 11447,
  name: '(MUZ00218) BOLSA QUADSEAL, BOLSA PAPEL KRAFT 250 GRM',
  description_sale: false as const,
  descripcion_larga: null,
  seo_description: null,
  categ_id: [128, 'Empaques para Granos y Polvos Reciclable'] as [number, string],
  default_code: '2300100156' as string | false,
  has_image: true,
  image_version: '20260901120000',
  image_url: null,
  price: 1004,
};

test('el canonical del storefront vive en el subdominio y conserva categoría y página', () => {
  assert.equal(buildEmpaquesHomeCanonical(null), `${EMPAQUES_CANONICAL_ORIGIN}/`);
  assert.equal(buildEmpaquesHomeCanonical(128), `${EMPAQUES_CANONICAL_ORIGIN}/?categoria=128`);
  assert.equal(buildEmpaquesHomeCanonical(128, 2), `${EMPAQUES_CANONICAL_ORIGIN}/?categoria=128&page=2`);
  assert.equal(buildEmpaquesHomeCanonical(null, 1), `${EMPAQUES_CANONICAL_ORIGIN}/`);
  assert.equal(buildEmpaquesProductCanonical(11447), `${EMPAQUES_CANONICAL_ORIGIN}/empaques/11447`);
  assert.equal(buildEmpaquesPersonalizadosCanonical(), `${EMPAQUES_CANONICAL_ORIGIN}/personalizados`);
  for (const invalid of [0, -3, 1.5, NaN, Infinity]) {
    assert.throws(() => buildEmpaquesHomeCanonical(invalid));
    assert.throws(() => buildEmpaquesProductCanonical(invalid));
  }
  assert.throws(() => buildEmpaquesHomeCanonical(128, 0));
});

test('el Product JSON-LD publica precio antes de IVA sin declarar inventario', () => {
  const jsonLd = buildEmpaquesProductJsonLd(baseProduct) as Record<string, unknown>;
  assert.equal(jsonLd['@type'], 'Product');
  assert.equal(jsonLd.sku, '2300100156');
  assert.equal(jsonLd.category, 'Empaques para Granos y Polvos Reciclable');
  assert.deepEqual(jsonLd.image, [`${EMPAQUES_CANONICAL_ORIGIN}/api/empaques/imagen/11447?s=1920&v=20260901120000`]);
  const offers = jsonLd.offers as Record<string, unknown>;
  assert.equal(offers.price, 1004);
  assert.equal(offers.priceCurrency, 'COP');
  assert.equal((offers.priceSpecification as Record<string, unknown>).valueAddedTaxIncluded, false);
  assert.equal('availability' in offers, false);
});

test('sin precio resuelto no se inventa una oferta; sin foto no se declara imagen', () => {
  const jsonLd = buildEmpaquesProductJsonLd({
    ...baseProduct,
    price: null,
    has_image: false,
    default_code: false,
  }) as Record<string, unknown>;
  assert.equal('offers' in jsonLd, false);
  assert.equal('image' in jsonLd, false);
  assert.equal('sku' in jsonLd, false);
});

test('la imagen editorial publicada tiene prioridad sobre la fotografía de Odoo', () => {
  const jsonLd = buildEmpaquesProductJsonLd({
    ...baseProduct,
    image_url: 'https://cdn.example.com/foto.webp',
  }) as Record<string, unknown>;
  assert.deepEqual(jsonLd.image, ['https://cdn.example.com/foto.webp']);
});

test('la descripción SEO usa el override editorial y cae a datos reales del producto', () => {
  assert.equal(getEmpaquesProductSeoDescription({ ...baseProduct, seo_description: 'Bolsa kraft para granos.' }), 'Bolsa kraft para granos.');
  assert.equal(getEmpaquesProductSeoDescription({ ...baseProduct, description_sale: '  Detalle comercial.  ' }), 'Detalle comercial.');
  assert.equal(
    getEmpaquesProductSeoDescription(baseProduct),
    `${baseProduct.name} — Empaques para Granos y Polvos Reciclable — Soluciones de Empaques Imprima`,
  );
});

test('el JSON-LD serializado no puede cerrar el script ni romper el HTML', () => {
  const props = jsonLdScriptProps({ name: '</script><script>alert(1)</script>', extra: 'a & b < c' });
  const html = props.dangerouslySetInnerHTML.__html;
  assert.equal(html.includes('</script'), false);
  assert.equal(html.includes('<'), false);
  assert.equal(html.includes('>'), false);
  assert.deepEqual(JSON.parse(html), { name: '</script><script>alert(1)</script>', extra: 'a & b < c' });
});

test('breadcrumb y WebSite declaran las URLs canónicas del subdominio', () => {
  const breadcrumb = buildEmpaquesBreadcrumbJsonLd([
    { name: 'Empaques', url: buildEmpaquesHomeCanonical(null) },
    { name: 'Producto', url: buildEmpaquesProductCanonical(11447) },
  ]) as { itemListElement: Array<{ position: number; item: string }> };
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.position), [1, 2]);
  assert.equal(breadcrumb.itemListElement[1].item, `${EMPAQUES_CANONICAL_ORIGIN}/empaques/11447`);
  assert.throws(() => buildEmpaquesBreadcrumbJsonLd([]));
  const website = buildEmpaquesWebSiteJsonLd() as Record<string, unknown>;
  assert.equal(website.url, `${EMPAQUES_CANONICAL_ORIGIN}/`);
  assert.equal((website.publisher as Record<string, unknown>).name, 'Imprima S.A.S');
});
