import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import {
  authenticate,
  configFromParams,
  getConfigFromEnv,
  searchCount,
  searchRead,
  type OdooConfig,
} from '../src/lib/odoo/client';

type OdooConfigRow = {
  id: string;
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  odoo_password: string;
};

type OdooCategoryRow = {
  id: number;
  name?: string;
  complete_name?: string;
  parent_id?: [number, string] | false;
};

type OdooProductRow = {
  id: number;
  name?: string;
  default_code?: string | false;
  categ_id?: [number, string] | false;
  list_price?: number;
  standard_price?: number;
  uom_name?: string;
};

const ODOO_FALSE = false as const;

async function getScriptOdooConfig(): Promise<{ config: OdooConfig; source: 'supabase' | 'env' }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from('odoo_configs')
      .select('id, odoo_url, odoo_db, odoo_username, odoo_password')
      .is('empresa_id', null)
      .maybeSingle<OdooConfigRow>();

    if (error) {
      console.warn(`No se pudo leer odoo_configs desde Supabase: ${error.message}`);
    }

    if (data?.odoo_url && data.odoo_db && data.odoo_username && data.odoo_password) {
      return {
        source: 'supabase',
        config: configFromParams({
          url: data.odoo_url,
          db: data.odoo_db,
          username: data.odoo_username,
          password: data.odoo_password,
        }),
      };
    }
  }

  const envConfig = getConfigFromEnv();
  if (!envConfig) {
    throw new Error('No se encontró configuración Odoo ni en Supabase ni en variables de entorno');
  }

  return { source: 'env', config: envConfig };
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function asCategoryRows(rows: Record<string, unknown>[]): OdooCategoryRow[] {
  return rows
    .map((row) => ({
      id: Number(row.id),
      name: typeof row.name === 'string' ? row.name : undefined,
      complete_name: typeof row.complete_name === 'string' ? row.complete_name : undefined,
      parent_id: Array.isArray(row.parent_id) ? (row.parent_id as [number, string]) : ODOO_FALSE,
    }))
    .filter((row) => Number.isFinite(row.id));
}

function asProductRows(rows: Record<string, unknown>[]): OdooProductRow[] {
  return rows
    .map((row) => ({
      id: Number(row.id),
      name: typeof row.name === 'string' ? row.name : undefined,
      default_code: typeof row.default_code === 'string' ? row.default_code : ODOO_FALSE,
      categ_id: Array.isArray(row.categ_id) ? (row.categ_id as [number, string]) : ODOO_FALSE,
      list_price: typeof row.list_price === 'number' ? row.list_price : undefined,
      standard_price: typeof row.standard_price === 'number' ? row.standard_price : undefined,
      uom_name: typeof row.uom_name === 'string' ? row.uom_name : undefined,
    }))
    .filter((row) => Number.isFinite(row.id));
}

function getDescendantIds(categories: OdooCategoryRow[], rootIds: number[]) {
  const childrenByParent = new Map<number, number[]>();
  for (const category of categories) {
    const parentId = Array.isArray(category.parent_id) ? Number(category.parent_id[0]) : null;
    if (!parentId) continue;
    const current = childrenByParent.get(parentId) ?? [];
    current.push(category.id);
    childrenByParent.set(parentId, current);
  }

  const result = new Set<number>();
  const stack = [...rootIds];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || result.has(currentId)) continue;
    result.add(currentId);
    for (const childId of childrenByParent.get(currentId) ?? []) {
      stack.push(childId);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function printCategories(title: string, categories: OdooCategoryRow[]) {
  console.log(`\n${title} (${categories.length})`);
  for (const category of categories) {
    const parent = Array.isArray(category.parent_id) ? ` | padre: [${category.parent_id[0]}] ${category.parent_id[1]}` : '';
    console.log(`- [${category.id}] ${category.complete_name || category.name}${parent}`);
  }
}

function printProducts(title: string, products: OdooProductRow[]) {
  console.log(`\n${title} (${products.length})`);
  for (const product of products) {
    const category = Array.isArray(product.categ_id) ? `[${product.categ_id[0]}] ${product.categ_id[1]}` : 'sin categoría';
    console.log(
      `- [${product.id}] ${product.name || 'Sin nombre'} | ref: ${product.default_code || 'N/A'} | categoría: ${category} | costo: ${product.standard_price ?? 'N/A'} | lista: ${product.list_price ?? 'N/A'} | unidad: ${product.uom_name || 'N/A'}`
    );
  }
}

async function main() {
  console.log('DIAGNÓSTICO ODOO EMPAQUES');
  const resolvedConfig = await getScriptOdooConfig();
  console.log(`Fuente configuración Odoo: ${resolvedConfig.source}`);
  console.log(`URL Odoo configurada: ${resolvedConfig.config.url ? 'sí' : 'no'}`);
  console.log(`DB Odoo configurada: ${resolvedConfig.config.db}`);
  console.log(`Usuario Odoo configurado: ${resolvedConfig.config.username}`);

  const session = await authenticate(resolvedConfig.config);
  console.log(`UID autenticado: ${session.uid}`);

  const categoryRows = await searchRead(
    'product.category',
    [],
    ['id', 'name', 'complete_name', 'parent_id'],
    { order: 'complete_name asc', session }
  );
  const categories = asCategoryRows(categoryRows);

  const empaqueMatches = categories.filter((category) => {
    const text = normalize(`${category.name || ''} ${category.complete_name || ''}`);
    return text.includes('empaque');
  });
  const oficinaMatches = categories.filter((category) => normalize(category.complete_name || category.name).includes('suministros de oficina'));
  const cafeteriaMatches = categories.filter((category) => {
    const text = normalize(category.complete_name || category.name);
    return text === 'suministros de oficina / cafeteria' || text.startsWith('suministros de oficina / cafeteria /');
  });

  printCategories('Categorías que contienen empaque', empaqueMatches);
  printCategories('Categorías que contienen suministros de oficina', oficinaMatches);
  printCategories('Categorías que contienen cafetería', cafeteriaMatches);

  const rootEmpaqueCategories = empaqueMatches.filter((category) => {
    const text = normalize(category.complete_name || category.name);
    return text === 'empaques' || text === 'soluciones de empaques';
  });
  const rootEmpaqueIds = rootEmpaqueCategories.map((category) => category.id);
  const empaqueDescendantIds = getDescendantIds(categories, rootEmpaqueIds);
  const cafeteriaIds = cafeteriaMatches.map((category) => category.id);
  const cafeteriaDescendantIds = getDescendantIds(categories, cafeteriaIds);
  const combinedCategoryIds = Array.from(new Set([...empaqueDescendantIds, ...cafeteriaDescendantIds])).sort((a, b) => a - b);

  printCategories('Categorías raíz detectadas para Empaques', rootEmpaqueCategories);
  console.log(`\nIDs descendientes de empaque: ${empaqueDescendantIds.join(', ') || 'ninguno'}`);
  console.log(`IDs cafetería + descendientes: ${cafeteriaDescendantIds.join(', ') || 'ninguno'}`);
  console.log(`IDs combinados para storefront: ${combinedCategoryIds.join(', ') || 'ninguno'}`);

  for (const rootId of rootEmpaqueIds) {
    const directCount = await searchCount('product.template', [
      ['sale_ok', '=', true],
      ['active', '=', true],
      ['categ_id', '=', rootId],
    ], session);
    console.log(`\nProductos directos en raíz empaque [${rootId}]: ${directCount}`);

    try {
      const childOfCount = await searchCount('product.template', [
        ['sale_ok', '=', true],
        ['active', '=', true],
        ['categ_id', 'child_of', rootId],
      ], session);
      console.log(`Productos usando child_of raíz empaque [${rootId}]: ${childOfCount}`);
    } catch (error) {
      console.log(`child_of falló para raíz empaque [${rootId}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (combinedCategoryIds.length > 0) {
    const totalCombined = await searchCount('product.template', [
      ['sale_ok', '=', true],
      ['active', '=', true],
      ['categ_id', 'in', combinedCategoryIds],
    ], session);
    console.log(`\nProductos vendibles en categorías combinadas: ${totalCombined}`);

    const sampleRows = await searchRead(
      'product.template',
      [
        ['sale_ok', '=', true],
        ['active', '=', true],
        ['categ_id', 'in', combinedCategoryIds],
      ],
      ['id', 'name', 'default_code', 'categ_id', 'list_price', 'standard_price', 'uom_name'],
      { limit: 30, order: 'name asc', session }
    );
    printProducts('Muestra de productos combinados', asProductRows(sampleRows));
  }
}

main().catch((error) => {
  console.error('Error fatal en diagnóstico:', error);
  process.exit(1);
});
