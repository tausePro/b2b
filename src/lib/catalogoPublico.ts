import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  authenticate,
  getCategoriasProducto,
  searchCount,
  searchRead,
  type OdooCategory,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import type {
  PublicCatalogCategoryNode,
  PublicCatalogListingResult,
  PublicCatalogPageData,
  PublicCatalogProduct,
  PublicProductDetail,
} from '@/types/publicCatalog';

export const PUBLIC_CATALOG_DEFAULT_LIMIT = 24;
export const PUBLIC_CATALOG_MAX_LIMIT = 48;
export const PUBLIC_CATALOG_MIN_SEARCH_LENGTH = 3;

const EXCLUDED_PUBLIC_ROOT_CATEGORY_NAMES: ReadonlySet<string> = new Set(
  ['empaques', 'gastos', 'saleable', 'movimientos contables', 'transporte'].map((n) =>
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  )
);

const PUBLIC_CATALOG_VIRTUAL_ROOT_NAME = 'suministros de oficina';

function normalizeForComparison(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function findVirtualRootId(categories: OdooCategory[]): number | null {
  for (const cat of categories) {
    if (Array.isArray(cat.parent_id)) continue;
    if (normalizeForComparison(cat.name) === PUBLIC_CATALOG_VIRTUAL_ROOT_NAME) {
      return cat.id;
    }
  }
  return null;
}

function isExcludedCategory(category: OdooCategory, virtualRootId: number | null): boolean {
  const isRoot = !Array.isArray(category.parent_id);
  const isVirtualRootChild = virtualRootId && Array.isArray(category.parent_id) && category.parent_id[0] === virtualRootId;

  if (!isRoot && !isVirtualRootChild) return false;

  const normalized = normalizeForComparison(category.name);
  return EXCLUDED_PUBLIC_ROOT_CATEGORY_NAMES.has(normalized);
}

interface PublicCatalogQueryInput {
  categoryId?: number | null;
  limit?: number;
  page?: number;
  search?: string | null;
}

interface PublicCatalogCategoryData {
  categoryIndex: Record<string, PublicCatalogCategoryNode>;
  categories: PublicCatalogCategoryNode[];
  excludedRootIds: number[];
  virtualRootId: number | null;
}

interface PublicCatalogListingData {
  productos: PublicCatalogProduct[];
  total: number;
  totalPages: number;
}

function mapPublicCatalogProduct(row: Record<string, unknown>): PublicCatalogProduct {
  const rawCategory = row.categ_id;
  const categ_id = Array.isArray(rawCategory) && rawCategory.length >= 2
    ? [Number(rawCategory[0]), String(rawCategory[1])] as [number, string]
    : false;

  return {
    id: Number(row.id),
    name: typeof row.name === 'string' ? row.name : `Producto ${String(row.id ?? '')}`,
    description_sale: typeof row.description_sale === 'string' ? row.description_sale : false,
    categ_id,
    image_128: typeof row.image_128 === 'string' ? row.image_128 : false,
    default_code: typeof row.default_code === 'string' ? row.default_code : false,
    uom_name: typeof row.uom_name === 'string' ? row.uom_name : 'und',
  };
}

function normalizeSearch(value?: string | null) {
  return (value || '').trim();
}

function normalizeLimit(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return PUBLIC_CATALOG_DEFAULT_LIMIT;
  }

  return Math.min(Math.trunc(value), PUBLIC_CATALOG_MAX_LIMIT);
}

function normalizePage(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 1;
  }

  return Math.trunc(value);
}

function normalizeCategoryId(value?: number | null) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return null;
  }

  return Math.trunc(value);
}

function slugifyCategory(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sortCategories(a: OdooCategory, b: OdooCategory) {
  return a.complete_name.localeCompare(b.complete_name, 'es');
}

function buildCategoryTree(categories: OdooCategory[]): PublicCatalogCategoryData {
  const excludedRootIdSet = new Set<number>();
  const byParentId = new Map<number | null, OdooCategory[]>();

  // Encontrar la categoría virtual raíz (ej: "Suministros de Oficina")
  const virtualRootId = findVirtualRootId(categories);

  for (const category of categories) {
    if (isExcludedCategory(category, virtualRootId)) {
      excludedRootIdSet.add(category.id);
    }
  }

  const collectDescendantIds = (rootId: number) => {
    const queue = [rootId];
    while (queue.length > 0) {
      const currentId = queue.pop()!;
      for (const cat of categories) {
        const pid = Array.isArray(cat.parent_id) ? cat.parent_id[0] : null;
        if (pid === currentId && !excludedRootIdSet.has(cat.id)) {
          excludedRootIdSet.add(cat.id);
          queue.push(cat.id);
        }
      }
    }
  };

  for (const rootId of Array.from(excludedRootIdSet)) {
    collectDescendantIds(rootId);
  }

  categories
    .slice()
    .sort(sortCategories)
    .forEach((category) => {
      if (excludedRootIdSet.has(category.id)) return;
      const parentId = Array.isArray(category.parent_id) ? category.parent_id[0] : null;
      const siblings = byParentId.get(parentId) ?? [];
      siblings.push(category);
      byParentId.set(parentId, siblings);
    });

  const categoryIndex: Record<string, PublicCatalogCategoryNode> = {};

  const buildNode = (category: OdooCategory, level: number): PublicCatalogCategoryNode => {
    // Para hijos directos de la virtual root, limpiar el prefijo del complete_name
    const displayName = virtualRootId && Array.isArray(category.parent_id) && category.parent_id[0] === virtualRootId
      ? category.name
      : category.name;
    const displayCompleteName = virtualRootId
      ? category.complete_name.replace(/^Suministros de Oficina\s*\/\s*/i, '')
      : category.complete_name;

    const node: PublicCatalogCategoryNode = {
      id: category.id,
      name: displayName,
      complete_name: displayCompleteName,
      slug: slugifyCategory(displayCompleteName),
      parentId: Array.isArray(category.parent_id) ? category.parent_id[0] : null,
      level,
      children: [],
    };

    categoryIndex[String(node.id)] = node;

    const children = (byParentId.get(category.id) ?? [])
      .slice()
      .sort(sortCategories)
      .map((child) => buildNode(child, level + 1));

    node.children = children;
    return node;
  };

  // Si hay virtual root, usar sus hijos como categorías raíz
  const rootParentId = virtualRootId ?? null;
  const categoriesTree = (byParentId.get(rootParentId) ?? [])
    .slice()
    .sort(sortCategories)
    .map((category) => buildNode(category, 0));

  const excludedRootIds = Array.from(excludedRootIdSet);

  return {
    categoryIndex,
    categories: categoriesTree,
    excludedRootIds,
    virtualRootId,
  };
}

function buildProductDomain(search: string, categoryId: number | null, excludedRootIds: number[], virtualRootId: number | null) {
  const domain: unknown[] = [
    ['sale_ok', '=', true],
    ['active', '=', true],
  ];

  // Si hay virtual root, solo mostrar productos bajo ella
  if (virtualRootId) {
    domain.push(['categ_id', 'child_of', virtualRootId]);
  }

  for (const excludedId of excludedRootIds) {
    domain.push('!', ['categ_id', 'child_of', excludedId]);
  }

  if (categoryId) {
    domain.push(['categ_id', 'child_of', categoryId]);
  }

  if (search) {
    domain.push('|', ['name', 'ilike', search], ['default_code', 'ilike', search]);
  }

  return domain;
}

const getCachedCategoryData = unstable_cache(
  async (): Promise<PublicCatalogCategoryData> => {
    const config = await getServerOdooConfig();
    if (!config) {
      throw new Error('Configuración de Odoo no encontrada');
    }

    const session = await authenticate(config);
    const categories = await getCategoriasProducto(session);
    return buildCategoryTree(categories);
  },
  ['public-catalog-category-data'],
  { revalidate: 3600 }
);

const getCachedListingData = unstable_cache(
  async (
    search: string,
    categoryId: number | null,
    page: number,
    limit: number,
    excludedRootIds: number[],
    virtualRootId: number | null
  ): Promise<PublicCatalogListingData> => {
    const config = await getServerOdooConfig();
    if (!config) {
      throw new Error('Configuración de Odoo no encontrada');
    }

    const session = await authenticate(config);
    const offset = (page - 1) * limit;
    const domain = buildProductDomain(search, categoryId, excludedRootIds, virtualRootId);

    const [productos, total] = await Promise.all([
      searchRead(
        'product.template',
        domain,
        ['id', 'name', 'description_sale', 'categ_id', 'image_128', 'default_code', 'uom_name'],
        { limit, offset, order: 'name asc', session }
      ),
      searchCount('product.template', domain, session),
    ]);

    return {
      productos: productos.map(mapPublicCatalogProduct),
      total,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
  },
  ['public-catalog-listing-data'],
  { revalidate: 900 }
);

export async function getPublicCatalogPageData(
  input: PublicCatalogQueryInput = {}
): Promise<PublicCatalogPageData> {
  const categoriesData = await getCachedCategoryData();
  const rawSearch = normalizeSearch(input.search);
  const normalizedLimit = normalizeLimit(input.limit);
  const requestedCategoryId = normalizeCategoryId(input.categoryId);
  const selectedCategory = requestedCategoryId
    ? categoriesData.categoryIndex[String(requestedCategoryId)] ?? null
    : null;
  const normalizedCategoryId = selectedCategory?.id ?? null;
  const normalizedPage = normalizePage(input.page);
  const searchTooShort = rawSearch.length > 0 && rawSearch.length < PUBLIC_CATALOG_MIN_SEARCH_LENGTH;
  const effectiveSearch = searchTooShort ? '' : rawSearch;

  const baseResult: PublicCatalogListingResult = {
    query: {
      search: rawSearch,
      categoryId: normalizedCategoryId,
      page: normalizedPage,
      limit: normalizedLimit,
    },
    productos: [],
    total: 0,
    totalPages: 0,
    selectedCategory,
    searchTooShort,
    minSearchLength: PUBLIC_CATALOG_MIN_SEARCH_LENGTH,
  };

  if (!normalizedCategoryId && !effectiveSearch) {
    return {
      ...baseResult,
      categories: categoriesData.categories,
    };
  }

  const listingData = await getCachedListingData(
    effectiveSearch,
    normalizedCategoryId,
    normalizedPage,
    normalizedLimit,
    categoriesData.excludedRootIds,
    categoriesData.virtualRootId
  );

  return {
    ...baseResult,
    productos: listingData.productos,
    total: listingData.total,
    totalPages: listingData.totalPages,
    categories: categoriesData.categories,
  };
}

const PRODUCT_DETAIL_FIELDS = [
  'id', 'name', 'description_sale', 'categ_id', 'image_128', 'image_1920',
  'default_code', 'uom_name', 'product_variant_count', 'attribute_line_ids',
];

function mapProductDetail(row: Record<string, unknown>): PublicProductDetail {
  const rawCategory = row.categ_id;
  const categ_id = Array.isArray(rawCategory) && rawCategory.length >= 2
    ? [Number(rawCategory[0]), String(rawCategory[1])] as [number, string]
    : false;

  return {
    id: Number(row.id),
    name: typeof row.name === 'string' ? row.name : `Producto ${String(row.id ?? '')}`,
    description_sale: typeof row.description_sale === 'string' ? row.description_sale : false,
    categ_id,
    image_128: typeof row.image_128 === 'string' ? row.image_128 : false,
    image_1920: typeof row.image_1920 === 'string' ? row.image_1920 : false,
    default_code: typeof row.default_code === 'string' ? row.default_code : false,
    uom_name: typeof row.uom_name === 'string' ? row.uom_name : 'und',
    product_variant_count: Number(row.product_variant_count ?? 1),
    attribute_line_ids: Array.isArray(row.attribute_line_ids) ? row.attribute_line_ids as number[] : [],
  };
}

const getCachedProductDetail = unstable_cache(
  async (productId: number): Promise<PublicProductDetail | null> => {
    const config = await getServerOdooConfig();
    if (!config) return null;

    const session = await authenticate(config);
    const rows = await searchRead(
      'product.template',
      [['id', '=', productId], ['sale_ok', '=', true], ['active', '=', true]],
      PRODUCT_DETAIL_FIELDS,
      { limit: 1, session }
    );

    return rows.length > 0 ? mapProductDetail(rows[0]) : null;
  },
  ['public-product-detail'],
  { revalidate: 900 }
);

const getCachedRelatedProducts = unstable_cache(
  async (categoryId: number, excludeProductId: number): Promise<PublicCatalogProduct[]> => {
    const config = await getServerOdooConfig();
    if (!config) return [];

    const session = await authenticate(config);
    const rows = await searchRead(
      'product.template',
      [
        ['categ_id', 'child_of', categoryId],
        ['id', '!=', excludeProductId],
        ['sale_ok', '=', true],
        ['active', '=', true],
      ],
      ['id', 'name', 'description_sale', 'categ_id', 'image_128', 'default_code', 'uom_name'],
      { limit: 6, order: 'name asc', session }
    );

    return rows.map(mapPublicCatalogProduct);
  },
  ['public-related-products'],
  { revalidate: 900 }
);

// Categorías raíz del catálogo público (nivel 0 del árbol ya filtrado,
// tras excluir roots no comerciales y colapsar el virtual root).
// Pensada para selectores del CMS y cualquier superficie pública que
// quiera mostrar solo las categorías "hero".
export async function getPublicCatalogRootCategories(): Promise<
  Array<{ id: number; name: string; complete_name: string; slug: string }>
> {
  const data = await getCachedCategoryData();
  return data.categories
    .filter((c) => c.level === 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      complete_name: c.complete_name,
      slug: c.slug,
    }));
}

export async function getPublicProductDetail(productId: number) {
  const product = await getCachedProductDetail(productId);
  if (!product) return null;

  const categId = Array.isArray(product.categ_id) ? product.categ_id[0] : null;
  const related = categId ? await getCachedRelatedProducts(categId, product.id) : [];
  const categoriesData = await getCachedCategoryData();
  const categoryNode = categId ? categoriesData.categoryIndex[String(categId)] ?? null : null;

  return { product, related, category: categoryNode };
}
