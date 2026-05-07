import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  authenticate,
  getCategoriasProducto,
  searchCount,
  searchRead,
  type OdooCategory,
  type OdooProduct,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import {
  calculateSellingPrice,
  getEffectiveMargin,
  type PricingContext,
} from '@/lib/pricing/margins';

export const EMPAQUES_DEFAULT_LIMIT = 24;
export const EMPAQUES_MAX_LIMIT = 48;
export const EMPAQUES_MIN_SEARCH_LENGTH = 3;
export const EMPAQUES_SLUG = 'empaques';

const EMPAQUES_ROOT_CATEGORY_ID = 132;
const CAFETERIA_ROOT_CATEGORY_ID = 11;
const EXCLUDED_CATEGORY_IDS = [103];
const ENABLED_ROOT_CATEGORY_IDS = [EMPAQUES_ROOT_CATEGORY_ID, CAFETERIA_ROOT_CATEGORY_ID];

const PRODUCT_FIELDS = [
  'id',
  'name',
  'description_sale',
  'list_price',
  'standard_price',
  'uom_name',
  'categ_id',
  'product_tag_ids',
  'active',
  'sale_ok',
  'image_128',
  'default_code',
  'product_variant_count',
  'attribute_line_ids',
];

interface EmpaquesStorefrontContext {
  id: string;
  nombre: string;
  slug: string;
  modoPricing: 'pricelist' | 'costo_margen';
  rootCategoryIds: number[];
  excludedCategoryIds: number[];
}

export interface EmpaquesCategoryNode {
  id: number;
  name: string;
  complete_name: string;
  slug: string;
  descripcion_corta: string | null;
  imagen_url: string | null;
  destacado: boolean;
  orden: number;
  parentId: number | null;
  level: number;
  children: EmpaquesCategoryNode[];
}

export type EmpaquesPricingSource = 'override' | 'costo_margen' | 'manual_pendiente';

export interface EmpaquesCatalogProduct {
  id: number;
  name: string;
  slug: string;
  description_sale: string | false;
  descripcion_larga: string | null;
  categ_id: [number, string] | false;
  image_128: string | false;
  image_url: string | null;
  default_code: string | false;
  uom_name: string;
  product_variant_count: number;
  destacado: boolean;
  orden: number;
  seo_title: string | null;
  seo_description: string | null;
  price: number | null;
  pricing_source: EmpaquesPricingSource;
  requiere_precio_manual: boolean;
}

export interface EmpaquesCatalogData {
  query: {
    search: string;
    categoryId: number | null;
    page: number;
    limit: number;
  };
  storefront: EmpaquesStorefrontContext;
  categories: EmpaquesCategoryNode[];
  productos: EmpaquesCatalogProduct[];
  total: number;
  totalPages: number;
  selectedCategory: EmpaquesCategoryNode | null;
  searchTooShort: boolean;
  minSearchLength: number;
}

export class EmpaquesConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmpaquesConfigurationError';
  }
}

export async function getEmpaquesPublicAvailability(): Promise<{ enabled: boolean; reason: string | null }> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('storefront_configs')
      .select('activo')
      .eq('slug', EMPAQUES_SLUG)
      .maybeSingle();

    if (error || !data) {
      return { enabled: false, reason: error?.message ?? "No existe una configuración en storefront_configs con slug = 'empaques'." };
    }

    if (data.activo === false) {
      return { enabled: false, reason: 'El storefront de Empaques está inactivo.' };
    }

    return { enabled: true, reason: null };
  } catch (error) {
    return { enabled: false, reason: error instanceof Error ? error.message : 'No se pudo resolver el estado de Empaques.' };
  }
}

interface EmpaquesCatalogInput {
  categoryId?: number | null;
  includeInactive?: boolean;
  limit?: number;
  page?: number;
  search?: string | null;
}

interface CategoryTreeData {
  categories: EmpaquesCategoryNode[];
  categoryIndex: Record<string, EmpaquesCategoryNode>;
}

interface StorefrontConfigRow {
  id: string;
  slug: string | null;
  nombre: string | null;
  modo_pricing: string | null;
  activo: boolean | null;
  odoo_root_category_ids: unknown;
  odoo_excluded_category_ids: unknown;
}

interface StorefrontMargenRow {
  odoo_categ_id: number | null;
  margen_porcentaje: number;
}

interface StorefrontCategoryOverrideRow {
  odoo_categ_id: number;
  nombre_publico: string | null;
  slug: string | null;
  descripcion_corta: string | null;
  imagen_url: string | null;
  orden: number | null;
  visible: boolean | null;
  destacado: boolean | null;
}

interface StorefrontProductOverrideRow {
  odoo_product_id: number;
  nombre_publico: string | null;
  slug: string | null;
  descripcion_corta: string | null;
  descripcion_larga: string | null;
  imagen_url: string | null;
  orden: number | null;
  visible: boolean | null;
  destacado: boolean | null;
  seo_title: string | null;
  seo_description: string | null;
}

interface StorefrontEditorialContext {
  categories: Map<number, StorefrontCategoryOverrideRow>;
  products: Map<number, StorefrontProductOverrideRow>;
  hiddenCategoryIds: number[];
  hiddenProductIds: number[];
}

function emptyEditorialContext(): StorefrontEditorialContext {
  return {
    categories: new Map(),
    products: new Map(),
    hiddenCategoryIds: [],
    hiddenProductIds: [],
  };
}

function isMissingEditorialTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error
    && (
      error.code === 'PGRST205'
      || error.message?.includes('storefront_category_overrides')
      || error.message?.includes('storefront_product_overrides')
    )
  );
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new EmpaquesConfigurationError('Configuración de Supabase no encontrada para resolver Empaques.');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey);
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSearch(value?: string | null) {
  return (value || '').trim();
}

function normalizeLimit(value?: number) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return EMPAQUES_DEFAULT_LIMIT;
  }

  return Math.min(Math.trunc(value), EMPAQUES_MAX_LIMIT);
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

function asNumberArray(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return fallback;

  const values = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.trunc(item));

  return values.length > 0 ? Array.from(new Set(values)) : fallback;
}

function getParentId(category: OdooCategory) {
  return Array.isArray(category.parent_id) ? category.parent_id[0] : null;
}

function getDescendantIds(categories: OdooCategory[], rootIds: number[]) {
  const ids = new Set(rootIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const category of categories) {
      const parentId = getParentId(category);
      if (parentId !== null && ids.has(parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }

  return ids;
}

function stripCommercialPrefix(category: OdooCategory) {
  if (category.id === EMPAQUES_ROOT_CATEGORY_ID) return 'Empaques';
  if (category.id === CAFETERIA_ROOT_CATEGORY_ID) return 'Cafetería';

  return category.complete_name
    .replace(/^Soluciones de Empaques\s*\/\s*/i, 'Empaques / ')
    .replace(/^Suministros de Oficina\s*\/\s*Cafetería\s*\/\s*/i, 'Cafetería / ')
    .replace(/^Suministros de Oficina\s*\/\s*Cafeteria\s*\/\s*/i, 'Cafetería / ')
    .replace(/^Suministros de Oficina\s*\/\s*/i, '');
}

function getCategoryOrder(category: OdooCategory, overrides: Map<number, StorefrontCategoryOverrideRow>) {
  return overrides.get(category.id)?.orden ?? 0;
}

function buildCategoryTree(
  categories: OdooCategory[],
  rootCategoryIds: number[],
  excludedCategoryIds: number[],
  editorialCtx: StorefrontEditorialContext
): CategoryTreeData {
  const allowedIds = getDescendantIds(categories, rootCategoryIds);
  for (const excludedId of excludedCategoryIds) {
    allowedIds.delete(excludedId);
  }
  for (const hiddenCategoryId of getDescendantIds(categories, editorialCtx.hiddenCategoryIds)) {
    allowedIds.delete(hiddenCategoryId);
  }

  const filtered = categories.filter((category) => allowedIds.has(category.id));
  const byParentId = new Map<number | null, OdooCategory[]>();

  for (const category of filtered) {
    const parentId = getParentId(category);
    const normalizedParentId = parentId !== null && allowedIds.has(parentId) ? parentId : null;
    const siblings = byParentId.get(normalizedParentId) ?? [];
    siblings.push(category);
    byParentId.set(normalizedParentId, siblings);
  }

  const categoryIndex: Record<string, EmpaquesCategoryNode> = {};

  const buildNode = (category: OdooCategory, level: number): EmpaquesCategoryNode => {
    const completeName = stripCommercialPrefix(category);
    const override = editorialCtx.categories.get(category.id);
    const publicName = override?.nombre_publico?.trim() || (category.id === EMPAQUES_ROOT_CATEGORY_ID || category.id === CAFETERIA_ROOT_CATEGORY_ID ? stripCommercialPrefix(category) : category.name);
    const node: EmpaquesCategoryNode = {
      id: category.id,
      name: publicName,
      complete_name: completeName,
      slug: override?.slug?.trim() || slugify(completeName),
      descripcion_corta: override?.descripcion_corta?.trim() || null,
      imagen_url: override?.imagen_url?.trim() || null,
      destacado: override?.destacado ?? false,
      orden: override?.orden ?? 0,
      parentId: getParentId(category),
      level,
      children: [],
    };

    categoryIndex[String(node.id)] = node;
    node.children = (byParentId.get(category.id) ?? [])
      .slice()
      .sort((a, b) => getCategoryOrder(a, editorialCtx.categories) - getCategoryOrder(b, editorialCtx.categories) || stripCommercialPrefix(a).localeCompare(stripCommercialPrefix(b), 'es'))
      .map((child) => buildNode(child, level + 1));

    return node;
  };

  const categoriesTree = rootCategoryIds
    .map((id) => filtered.find((category) => category.id === id))
    .filter((category): category is OdooCategory => Boolean(category))
    .sort((a, b) => getCategoryOrder(a, editorialCtx.categories) - getCategoryOrder(b, editorialCtx.categories) || stripCommercialPrefix(a).localeCompare(stripCommercialPrefix(b), 'es'))
    .map((category) => buildNode(category, 0));

  return { categories: categoriesTree, categoryIndex };
}

function buildProductDomain(
  search: string,
  categoryId: number | null,
  rootCategoryIds: number[],
  excludedCategoryIds: number[],
  hiddenProductIds: number[]
) {
  const domain: unknown[] = [
    ['sale_ok', '=', true],
    ['active', '=', true],
  ];

  if (categoryId) {
    domain.push(['categ_id', 'child_of', categoryId]);
  } else {
    if (rootCategoryIds.length === 1) {
      domain.push(['categ_id', 'child_of', rootCategoryIds[0]]);
    } else {
      for (let i = 0; i < rootCategoryIds.length - 1; i += 1) {
        domain.push('|');
      }
      for (const rootCategoryId of rootCategoryIds) {
        domain.push(['categ_id', 'child_of', rootCategoryId]);
      }
    }
  }

  for (const excludedId of excludedCategoryIds) {
    domain.push('!', ['categ_id', 'child_of', excludedId]);
  }

  if (hiddenProductIds.length > 0) {
    domain.push(['id', 'not in', hiddenProductIds]);
  }

  if (search) {
    domain.push('|', ['name', 'ilike', search], ['default_code', 'ilike', search]);
  }

  return domain;
}

function mapCategoryValue(value: OdooProduct['categ_id']): [number, string] | false {
  return Array.isArray(value) && value.length >= 2 ? [Number(value[0]), String(value[1])] : false;
}

function resolveEmpaquesPrice(ctx: PricingContext, product: OdooProduct): Pick<EmpaquesCatalogProduct, 'price' | 'pricing_source' | 'requiere_precio_manual'> {
  if (ctx.overrides.has(product.id)) {
    return {
      price: ctx.overrides.get(product.id)!,
      pricing_source: 'override',
      requiere_precio_manual: false,
    };
  }

  if (Number.isFinite(product.standard_price) && product.standard_price > 0) {
    const categId = Array.isArray(product.categ_id) ? product.categ_id[0] : null;
    const margin = getEffectiveMargin(ctx.margins, categId);
    const price = calculateSellingPrice(product.standard_price, margin);

    return {
      price,
      pricing_source: 'costo_margen',
      requiere_precio_manual: false,
    };
  }

  return {
    price: null,
    pricing_source: 'manual_pendiente',
    requiere_precio_manual: true,
  };
}

function mapProduct(
  product: OdooProduct,
  pricingCtx: PricingContext,
  editorialCtx: StorefrontEditorialContext
): EmpaquesCatalogProduct {
  const pricing = resolveEmpaquesPrice(pricingCtx, product);
  const override = editorialCtx.products.get(product.id);
  const name = override?.nombre_publico?.trim() || product.name;
  const description = override?.descripcion_corta?.trim() || (typeof product.description_sale === 'string' ? product.description_sale : false);

  return {
    id: product.id,
    name,
    slug: override?.slug?.trim() || slugify(name),
    description_sale: description,
    descripcion_larga: override?.descripcion_larga?.trim() || null,
    categ_id: mapCategoryValue(product.categ_id),
    image_128: typeof product.image_128 === 'string' ? product.image_128 : false,
    image_url: override?.imagen_url?.trim() || null,
    default_code: typeof product.default_code === 'string' ? product.default_code : false,
    uom_name: typeof product.uom_name === 'string' ? product.uom_name : 'und',
    product_variant_count: Number(product.product_variant_count ?? 1),
    destacado: override?.destacado ?? false,
    orden: override?.orden ?? 0,
    seo_title: override?.seo_title?.trim() || null,
    seo_description: override?.seo_description?.trim() || null,
    ...pricing,
  };
}

async function getEmpaquesStorefront(options: { includeInactive?: boolean } = {}): Promise<EmpaquesStorefrontContext> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from('storefront_configs')
    .select('id, slug, nombre, modo_pricing, activo, odoo_root_category_ids, odoo_excluded_category_ids')
    .eq('slug', EMPAQUES_SLUG)
    .maybeSingle();

  if (error) {
    throw new EmpaquesConfigurationError(error.message);
  }

  const config = data as StorefrontConfigRow | null;
  if (!config?.id) {
    throw new EmpaquesConfigurationError("No existe una configuración en storefront_configs con slug = 'empaques'.");
  }

  if (config.activo === false && !options.includeInactive) {
    throw new EmpaquesConfigurationError('El storefront de Empaques está inactivo.');
  }

  return {
    id: String(config.id),
    nombre: typeof config.nombre === 'string' ? config.nombre : 'Imprima Empaques',
    slug: typeof config.slug === 'string' ? config.slug : EMPAQUES_SLUG,
    modoPricing: config.modo_pricing === 'pricelist' ? 'pricelist' : 'costo_margen',
    rootCategoryIds: asNumberArray(config.odoo_root_category_ids, ENABLED_ROOT_CATEGORY_IDS),
    excludedCategoryIds: asNumberArray(config.odoo_excluded_category_ids, EXCLUDED_CATEGORY_IDS),
  };
}

async function loadStorefrontPricingContext(storefrontId: string, modoPricing: EmpaquesStorefrontContext['modoPricing']): Promise<PricingContext> {
  const admin = getSupabaseAdmin();
  const [margenesRes, overridesRes] = await Promise.all([
    admin
      .from('storefront_margenes_venta')
      .select('odoo_categ_id, margen_porcentaje')
      .eq('storefront_config_id', storefrontId),
    admin
      .from('storefront_precios_producto')
      .select('odoo_product_id, precio_override')
      .eq('storefront_config_id', storefrontId),
  ]);

  if (margenesRes.error) {
    throw new EmpaquesConfigurationError(margenesRes.error.message);
  }
  if (overridesRes.error) {
    throw new EmpaquesConfigurationError(overridesRes.error.message);
  }

  const byCateg = new Map<number, number>();
  let defaultMargin = 20;
  for (const row of (margenesRes.data ?? []) as StorefrontMargenRow[]) {
    if (row.odoo_categ_id === null) {
      defaultMargin = row.margen_porcentaje;
    } else {
      byCateg.set(row.odoo_categ_id, row.margen_porcentaje);
    }
  }

  const overrides = new Map<number, number>();
  for (const row of (overridesRes.data ?? []) as { odoo_product_id: number; precio_override: number }[]) {
    overrides.set(row.odoo_product_id, row.precio_override);
  }

  return {
    modoPricing,
    margins: { byCateg, defaultMargin },
    overrides,
  };
}

async function loadStorefrontEditorialContext(storefrontId: string): Promise<StorefrontEditorialContext> {
  const admin = getSupabaseAdmin();
  const [categoriesRes, productsRes] = await Promise.all([
    admin
      .from('storefront_category_overrides')
      .select('odoo_categ_id, nombre_publico, slug, descripcion_corta, imagen_url, orden, visible, destacado')
      .eq('storefront_config_id', storefrontId)
      .eq('estado_publicacion', 'publicado'),
    admin
      .from('storefront_product_overrides')
      .select('odoo_product_id, nombre_publico, slug, descripcion_corta, descripcion_larga, imagen_url, orden, visible, destacado, seo_title, seo_description')
      .eq('storefront_config_id', storefrontId)
      .eq('estado_publicacion', 'publicado'),
  ]);

  if (categoriesRes.error) {
    if (isMissingEditorialTableError(categoriesRes.error)) {
      return emptyEditorialContext();
    }
    throw new EmpaquesConfigurationError(categoriesRes.error.message);
  }
  if (productsRes.error) {
    if (isMissingEditorialTableError(productsRes.error)) {
      return emptyEditorialContext();
    }
    throw new EmpaquesConfigurationError(productsRes.error.message);
  }

  const categories = new Map<number, StorefrontCategoryOverrideRow>();
  const hiddenCategoryIds: number[] = [];
  for (const row of (categoriesRes.data ?? []) as StorefrontCategoryOverrideRow[]) {
    if (row.visible === false) {
      hiddenCategoryIds.push(row.odoo_categ_id);
    } else {
      categories.set(row.odoo_categ_id, row);
    }
  }

  const products = new Map<number, StorefrontProductOverrideRow>();
  const hiddenProductIds: number[] = [];
  for (const row of (productsRes.data ?? []) as StorefrontProductOverrideRow[]) {
    if (row.visible === false) {
      hiddenProductIds.push(row.odoo_product_id);
    } else {
      products.set(row.odoo_product_id, row);
    }
  }

  return {
    categories,
    products,
    hiddenCategoryIds,
    hiddenProductIds,
  };
}

export async function getEmpaquesCatalogData(input: EmpaquesCatalogInput = {}): Promise<EmpaquesCatalogData> {
  const storefront = await getEmpaquesStorefront({ includeInactive: input.includeInactive });
  const config = await getServerOdooConfig();

  if (!config) {
    throw new EmpaquesConfigurationError('Configuración de Odoo no encontrada.');
  }

  const rawSearch = normalizeSearch(input.search);
  const limit = normalizeLimit(input.limit);
  const page = normalizePage(input.page);
  const requestedCategoryId = normalizeCategoryId(input.categoryId);
  const searchTooShort = rawSearch.length > 0 && rawSearch.length < EMPAQUES_MIN_SEARCH_LENGTH;
  const effectiveSearch = searchTooShort ? '' : rawSearch;
  const session = await authenticate(config);
  const [categories, editorialCtx] = await Promise.all([
    getCategoriasProducto(session),
    loadStorefrontEditorialContext(storefront.id),
  ]);
  const effectiveExcludedCategoryIds = [...storefront.excludedCategoryIds, ...editorialCtx.hiddenCategoryIds];
  const categoryTree = buildCategoryTree(categories, storefront.rootCategoryIds, storefront.excludedCategoryIds, editorialCtx);
  const selectedCategory = requestedCategoryId ? categoryTree.categoryIndex[String(requestedCategoryId)] ?? null : null;

  if (requestedCategoryId && !selectedCategory) {
    throw new EmpaquesConfigurationError('La categoría solicitada no pertenece al catálogo público de Empaques.');
  }

  const categoryId = selectedCategory?.id ?? null;
  const offset = (page - 1) * limit;
  const domain = buildProductDomain(effectiveSearch, categoryId, storefront.rootCategoryIds, effectiveExcludedCategoryIds, editorialCtx.hiddenProductIds);
  const pricingCtx = await loadStorefrontPricingContext(storefront.id, storefront.modoPricing);

  const [productos, total] = await Promise.all([
    searchRead('product.template', domain, PRODUCT_FIELDS, { limit, offset, order: 'name asc', session }),
    searchCount('product.template', domain, session),
  ]);

  return {
    query: {
      search: rawSearch,
      categoryId,
      page,
      limit,
    },
    storefront,
    categories: categoryTree.categories,
    productos: (productos as unknown as OdooProduct[]).map((product) => mapProduct(product, pricingCtx, editorialCtx)),
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    selectedCategory,
    searchTooShort,
    minSearchLength: EMPAQUES_MIN_SEARCH_LENGTH,
  };
}
