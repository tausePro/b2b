import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryTree, isMissingEditorialTableError } from '../src/lib/empaques/catalogo';
import { selectEmpaquesShowcaseCategories, getEmpaquesCategoryImageSrc, buildEmpaquesCategoryHref, normalizeCategoryPresentation, readCategoryPresentation, mergeCategoryPresentation, categoryImageStyle, categoryImageOverlay } from '../src/lib/empaques/product-images';
import type { OdooCategory } from '../src/lib/odoo/client';

const categoriasOdoo: OdooCategory[] = [
  { id: 132, name: 'Soluciones de Empaques', complete_name: 'Soluciones de Empaques', parent_id: false },
  { id: 128, name: 'Empaques para Granos y Polvos Reciclable', complete_name: 'Soluciones de Empaques / Empaques para Granos y Polvos Reciclable', parent_id: [132, 'Soluciones de Empaques'] },
  { id: 134, name: 'Porta Alimentos Reciclable', complete_name: 'Soluciones de Empaques / Porta Alimentos Reciclable', parent_id: [132, 'Soluciones de Empaques'] },
  { id: 1, name: 'Suministros de Oficina', complete_name: 'Suministros de Oficina', parent_id: false },
  { id: 4, name: 'Aseo', complete_name: 'Suministros de Oficina / Aseo', parent_id: [1, 'Suministros de Oficina'] },
  { id: 10, name: 'Papel higiénico y toallas de mano', complete_name: 'Suministros de Oficina / Aseo / Papel higiénico y toallas de mano', parent_id: [4, 'Aseo'] },
  { id: 11, name: 'Cafetería', complete_name: 'Suministros de Oficina / Cafetería', parent_id: [1, 'Suministros de Oficina'] },
  { id: 12, name: 'Desechables', complete_name: 'Suministros de Oficina / Cafetería / Desechables', parent_id: [11, 'Cafetería'] },
];
const editorial = { categories: new Map(), products: new Map(), hiddenCategoryIds: [], hiddenProductIds: [] };

for (const mode of ['raices', 'pricelist'] as const) {
  test(`excluir Oficina elimina sus descendientes del árbol en modo ${mode}`, () => {
    const result = buildCategoryTree(categoriasOdoo, {
      rootCategoryIds: [132, 11], excludedCategoryIds: [1, 103],
      ...(mode === 'pricelist' ? { allowedCategoryIds: new Set([128, 134, 10, 12]) } : {}),
    }, editorial);
    assert.deepEqual(Object.keys(result.categoryIndex).map(Number).sort((a, b) => a - b), [128, 132, 134]);
    assert.equal(result.categories.length, 1);
    assert.equal(result.categories[0].id, 132);
  });
}

test('ocultar la rama editorial publicada no modifica la taxonomía Odoo', () => {
  const before = JSON.stringify(categoriasOdoo);
  const result = buildCategoryTree(categoriasOdoo, {
    rootCategoryIds: [132, 11], excludedCategoryIds: [103], allowedCategoryIds: new Set([128, 134, 10, 12]),
  }, { ...editorial, hiddenCategoryIds: [1] });
  assert.deepEqual(Object.keys(result.categoryIndex).map(Number).sort((a, b) => a - b), [128, 132, 134]);
  assert.equal(JSON.stringify(categoriasOdoo), before);
});

test('la portada respeta destacadas y orden sin agregar tarjetas no seleccionadas', () => {
  const tree = buildCategoryTree(categoriasOdoo, { rootCategoryIds: [132], excludedCategoryIds: [] }, editorial);
  const root = tree.categories[0];
  root.children[0].destacado = true;
  root.children[0].orden = 2;
  root.children[1].destacado = true;
  root.children[1].orden = 1;
  assert.deepEqual(selectEmpaquesShowcaseCategories(tree.categories).map((category) => category.id), [134, 128]);
});

test('sin destacadas usa como máximo tres categorías reales y sin duplicados', () => {
  const tree = buildCategoryTree(categoriasOdoo, { rootCategoryIds: [132, 1], excludedCategoryIds: [] }, editorial);
  const result = selectEmpaquesShowcaseCategories([...tree.categories, ...tree.categories]);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map((category) => category.id)).size, 3);
  assert.deepEqual(selectEmpaquesShowcaseCategories([]), []);
});

test('una categoría sin imagen no recibe una fotografía de producto como respaldo', () => {
  assert.equal(getEmpaquesCategoryImageSrc({ imagen_url: null }), null);
  assert.equal(getEmpaquesCategoryImageSrc({ imagen_url: '  ' }), null);
});

test('los enlaces de categoría conservan filtros y llevan al bloque de productos en ambos dominios', () => {
  assert.equal(buildEmpaquesCategoryHref(128, '', 1, '/'), '/?categoria=128#productos');
  assert.equal(buildEmpaquesCategoryHref(134), '/empaques?categoria=134#productos');
  assert.equal(buildEmpaquesCategoryHref(null, '', 1, '/'), '/#productos');
  const url = new URL(buildEmpaquesCategoryHref(128, 'bolsa & kraft', 2, '/'), 'https://empaques.imprima.com.co');
  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('categoria'), '128');
  assert.equal(url.searchParams.get('q'), 'bolsa & kraft');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.hash, '#productos');
  for (const invalid of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => buildEmpaquesCategoryHref(invalid));
  assert.throws(() => buildEmpaquesCategoryHref(128, '', 0));
  assert.throws(() => buildEmpaquesCategoryHref(128, '', 1, '/otro' as '/'));
});

test('el modo automático conserva opacidad, sombra y posición horizontal o vertical anteriores', () => {
  const horizontal = normalizeCategoryPresentation(null, 100);
  const vertical = normalizeCategoryPresentation(null, 50);
  assert.deepEqual(categoryImageStyle(horizontal), { objectFit: 'cover', objectPosition: '100% 50%', opacity: 0.6 });
  assert.equal(categoryImageStyle(vertical).objectPosition, '50% 50%');
  assert.equal(categoryImageOverlay(horizontal), 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.25), transparent)');
  assert.equal(readCategoryPresentation({}), null);
});

test('el encuadre se guarda y se restaura sin modificar los demás metadatos', () => {
  const original = { conservar: { activo: true } };
  const settings = { ajuste: 'contain', posicion_x: 20, posicion_y: 70, opacidad: 100, sombra: 40 };
  const saved = mergeCategoryPresentation(original, settings);
  assert.deepEqual(readCategoryPresentation(saved), settings);
  assert.deepEqual(saved.conservar, original.conservar);
  assert.deepEqual(original, { conservar: { activo: true } });
  assert.equal(categoryImageStyle(readCategoryPresentation(saved)!).objectFit, 'contain');
  assert.deepEqual(mergeCategoryPresentation(saved, null), original);
});

test('el backend rechaza opciones de encuadre inválidas y la lectura de datos antiguos es acotada', () => {
  const settings = normalizeCategoryPresentation(null);
  for (const field of ['posicion_x', 'posicion_y', 'opacidad', 'sombra']) {
    for (const invalid of [-1, 101, NaN, Infinity, '50', null]) assert.throws(() => mergeCategoryPresentation({}, { ...settings, [field]: invalid }));
  }
  for (const ajuste of ['stretch', ['cover'], {}, null]) assert.throws(() => mergeCategoryPresentation({}, { ...settings, ajuste }));
  assert.throws(() => mergeCategoryPresentation({}, []));
  assert.deepEqual(normalizeCategoryPresentation({ posicion_x: -10, posicion_y: 150, opacidad: '100' }), { ajuste: 'cover', posicion_x: 0, posicion_y: 100, opacidad: 60, sombra: 85 });
});

test('el árbol público solo expone el encuadre normalizado, no el resto de contenido_extra', () => {
  const settings = { ajuste: 'contain', posicion_x: 50, posicion_y: 50, opacidad: 100, sombra: 40 };
  const categories = new Map([[128, { odoo_categ_id: 128, nombre_publico: null, slug: null, descripcion_corta: null, imagen_url: null, orden: 0, visible: true, destacado: true, contenido_extra: { imagen_presentacion: settings, interno: 'conservar' } }]]);
  const tree = buildCategoryTree(categoriasOdoo, { rootCategoryIds: [132], excludedCategoryIds: [] }, { ...editorial, categories });
  assert.deepEqual(tree.categoryIndex['128'].imagen_presentacion, settings);
  assert.equal('contenido_extra' in tree.categoryIndex['128'], false);
});

test('la falta de ficha_tecnica_url no se confunde con una tabla editorial inexistente', () => {
  assert.equal(isMissingEditorialTableError({ code: '42703', message: 'column storefront_product_overrides.ficha_tecnica_url does not exist' }), false);
  assert.equal(isMissingEditorialTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingEditorialTableError({ code: '42P01' }), true);
  assert.equal(isMissingEditorialTableError(null), false);
});
