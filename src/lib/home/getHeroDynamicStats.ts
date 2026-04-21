import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  authenticate,
  getCategoriasProducto,
  searchCount,
  type OdooCategory,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';

// Helpers de estadisticas dinamicas usadas en el hero del home.
// Se resuelven en build/SSR con cache (revalidate 1h) para no machacar a
// Odoo en cada render. Si el backend no responde, devolvemos null y el
// front cae al valor manual configurado en CMS.

export type HeroDynamicStatKey = 'productos_total' | 'categorias_total';

export type HeroDynamicStats = Partial<Record<HeroDynamicStatKey, number>>;

// Mismas exclusiones y virtual root que /catalogo publico, para que el
// conteo "+X productos" del hero matchee con lo que el visitante encuentra
// al navegar (no contar transporte, empaques, gastos, etc.).
const EXCLUDED_PUBLIC_ROOT_CATEGORY_NAMES: ReadonlySet<string> = new Set(
  ['empaques', 'gastos', 'saleable', 'movimientos contables', 'transporte'].map((n) =>
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(),
  ),
);

const PUBLIC_CATALOG_VIRTUAL_ROOT_NAME = 'suministros de oficina';

function norm(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function findVirtualRootId(categories: OdooCategory[]): number | null {
  for (const cat of categories) {
    if (Array.isArray(cat.parent_id)) continue;
    if (norm(cat.name) === PUBLIC_CATALOG_VIRTUAL_ROOT_NAME) return cat.id;
  }
  return null;
}

function collectExcludedIds(categories: OdooCategory[], virtualRootId: number | null): number[] {
  const excluded = new Set<number>();
  for (const cat of categories) {
    const isRoot = !Array.isArray(cat.parent_id);
    const isVirtualRootChild =
      virtualRootId && Array.isArray(cat.parent_id) && cat.parent_id[0] === virtualRootId;
    if (!isRoot && !isVirtualRootChild) continue;
    if (EXCLUDED_PUBLIC_ROOT_CATEGORY_NAMES.has(norm(cat.name))) excluded.add(cat.id);
  }
  // Propagamos a descendientes.
  const queue = Array.from(excluded);
  while (queue.length > 0) {
    const parentId = queue.pop()!;
    for (const cat of categories) {
      const pid = Array.isArray(cat.parent_id) ? cat.parent_id[0] : null;
      if (pid === parentId && !excluded.has(cat.id)) {
        excluded.add(cat.id);
        queue.push(cat.id);
      }
    }
  }
  return Array.from(excluded);
}

const fetchStats = unstable_cache(
  async (): Promise<HeroDynamicStats> => {
    try {
      const config = await getServerOdooConfig();
      if (!config) return {};

      const session = await authenticate(config);
      const categories = await getCategoriasProducto(session);
      const virtualRootId = findVirtualRootId(categories);
      const excludedRootIds = collectExcludedIds(categories, virtualRootId);

      // Dominio consistente con catalogoPublico: solo productos vendibles,
      // activos, dentro de la virtual root, excluyendo ramas no comerciales.
      const domain: unknown[] = [
        ['sale_ok', '=', true],
        ['active', '=', true],
      ];
      if (virtualRootId) domain.push(['categ_id', 'child_of', virtualRootId]);
      for (const excludedId of excludedRootIds) {
        domain.push('!', ['categ_id', 'child_of', excludedId]);
      }

      const productosTotal = await searchCount('product.template', domain, session);

      // Categorias total: solo las visibles en el catalogo publico (nivel 0
      // del arbol ya filtrado). Una "categoria" aqui es una rama raiz
      // navegable, no cada hoja del arbol.
      const excludedSet = new Set(excludedRootIds);
      const categoriasTotal = categories.filter((c) => {
        if (excludedSet.has(c.id)) return false;
        const parentId = Array.isArray(c.parent_id) ? c.parent_id[0] : null;
        // Consideramos "raiz" a hijos directos de la virtual root; si no
        // hay virtual root, raiz == sin padre.
        if (virtualRootId) return parentId === virtualRootId;
        return parentId === null;
      }).length;

      return { productos_total: productosTotal, categorias_total: categoriasTotal };
    } catch {
      return {};
    }
  },
  ['home-hero-dynamic-stats'],
  { revalidate: 3600 },
);

export async function getHeroDynamicStats(): Promise<HeroDynamicStats> {
  return fetchStats();
}
