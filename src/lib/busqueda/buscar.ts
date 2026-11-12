import type { MenuGroup, MenuItem } from '@/lib/navigation/menu';

export type SearchHitKind = 'pedido' | 'cliente' | 'cliente_odoo' | 'producto';
export interface SearchHit { kind: SearchHitKind; id: string; title: string; subtitle: string | null; href: string }
export interface PortalSearchResponse {
  query: string;
  pedidos: SearchHit[];
  clientes: SearchHit[];
  clientesOdoo: SearchHit[];
  productos: SearchHit[];
  warnings: string[];
}

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 80;

/** Texto comparable: sin tildes, minúsculas y espacios simples. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Consulta segura para búsquedas: recortada y sin comodines de SQL (`%`, `_`). */
export function sanitizeSearchQuery(value: string): string {
  return value.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
}

/** Opciones del menú que coinciden con la consulta; las que empiezan por el texto van primero. */
export function matchMenuItems(groups: readonly MenuGroup[], query: string, limit = 6): (MenuItem & { group: string | null })[] {
  const needle = normalizeSearchText(query);
  const items = groups.flatMap(group => group.items.map(entry => ({ ...entry, group: group.label })));
  if (!needle) return items.slice(0, limit);
  return items
    .map(entry => {
      const label = normalizeSearchText(entry.label);
      const groupLabel = normalizeSearchText(entry.group ?? '');
      const score = label.startsWith(needle) ? 0 : label.split(' ').some(word => word.startsWith(needle)) ? 1 : label.includes(needle) ? 2 : groupLabel.includes(needle) ? 3 : -1;
      return { entry, score };
    })
    .filter(candidate => candidate.score >= 0)
    .sort((a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label, 'es'))
    .slice(0, limit)
    .map(candidate => candidate.entry);
}
