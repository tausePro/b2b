import 'server-only';

import {
  EMPAQUES_MAX_LIMIT,
  getEmpaquesCatalogData,
  type EmpaquesCatalogProduct,
  type EmpaquesCategoryNode,
} from '@/lib/empaques/catalogo';

/** Cota superior de páginas recorridas para construir sitemap/llms.txt. */
const MAX_INDEX_PAGES = 25;

export interface EmpaquesSiteIndex {
  categories: EmpaquesCategoryNode[];
  products: EmpaquesCatalogProduct[];
  totalProducts: number;
  /** true cuando el catálogo excede la cota y el índice quedó parcial. */
  truncated: boolean;
}

export function flattenEmpaquesCategories(nodes: EmpaquesCategoryNode[]): EmpaquesCategoryNode[] {
  const result: EmpaquesCategoryNode[] = [];
  const seen = new Set<number>();
  const visit = (node: EmpaquesCategoryNode) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    result.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

/**
 * Índice completo del catálogo público de Empaques (categorías visibles y
 * productos publicados) para sitemap y recursos de lectura por asistentes.
 */
export async function loadEmpaquesSiteIndex(): Promise<EmpaquesSiteIndex> {
  const first = await getEmpaquesCatalogData({ page: 1, limit: EMPAQUES_MAX_LIMIT });
  const products = [...first.productos];
  const totalPages = Math.min(first.totalPages, MAX_INDEX_PAGES);

  for (let page = 2; page <= totalPages; page += 1) {
    const data = await getEmpaquesCatalogData({ page, limit: EMPAQUES_MAX_LIMIT });
    products.push(...data.productos);
  }

  const uniqueProducts = Array.from(new Map(products.map((product) => [product.id, product])).values());
  return {
    categories: flattenEmpaquesCategories(first.categories),
    products: uniqueProducts,
    totalProducts: first.total,
    truncated: first.totalPages > MAX_INDEX_PAGES,
  };
}
