import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryTree, isMissingEditorialTableError } from '../src/lib/empaques/catalogo';
import { selectEmpaquesShowcaseCategories, getEmpaquesCategoryImageSrc } from '../src/lib/empaques/product-images';
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

test('la falta de ficha_tecnica_url no se confunde con una tabla editorial inexistente', () => {
  assert.equal(isMissingEditorialTableError({ code: '42703', message: 'column storefront_product_overrides.ficha_tecnica_url does not exist' }), false);
  assert.equal(isMissingEditorialTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingEditorialTableError({ code: '42P01' }), true);
  assert.equal(isMissingEditorialTableError(null), false);
});
