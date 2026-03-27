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
} from '@/types/publicCatalog';

export const PUBLIC_CATALOG_DEFAULT_LIMIT = 24;
export const PUBLIC_CATALOG_MAX_LIMIT = 48;
export const PUBLIC_CATALOG_MIN_SEARCH_LENGTH = 3;

const EXCLUDED_PUBLIC_ROOT_CATEGORY_NAMES: ReadonlySet<string> = new Set(
  ['empaques', 'gastos'].map((n) =>
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  )
);

function isExcludedRootCategory(category: OdooCategory): boolean {
  if (Array.isArray(category.parent_id)) return false;
  const normalized = category.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

  for (const category of categories) {
    if (isExcludedRootCategory(category)) {
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
    const node: PublicCatalogCategoryNode = {
      id: category.id,
      name: category.name,
      complete_name: category.complete_name,
      slug: slugifyCategory(category.complete_name),
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

  const categoriesTree = (byParentId.get(null) ?? [])
    .slice()
    .sort(sortCategories)
    .map((category) => buildNode(category, 0));

  const excludedRootIds = Array.from(excludedRootIdSet);

  return {
    categoryIndex,
    categories: categoriesTree,
    excludedRootIds,
  };
}

function buildProductDomain(search: string, categoryId: number | null, excludedRootIds: number[]) {
  const domain: unknown[] = [
    ['sale_ok', '=', true],
    ['active', '=', true],
  ];

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
    excludedRootIds: number[]
  ): Promise<PublicCatalogListingData> => {
    const config = await getServerOdooConfig();
    if (!config) {
      throw new Error('Configuración de Odoo no encontrada');
    }

    const session = await authenticate(config);
    const offset = (page - 1) * limit;
    const domain = buildProductDomain(search, categoryId, excludedRootIds);

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
    categoriesData.excludedRootIds
  );

  return {
    ...baseResult,
    productos: listingData.productos,
    total: listingData.total,
    totalPages: listingData.totalPages,
    categories: categoriesData.categories,
  };
}
