import 'server-only';

import { authenticate, searchRead } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEstadoLabel } from '@/lib/utils';
import { searchCustomers } from '@/lib/gerencia/productosCliente.server';
import { MIN_SEARCH_LENGTH, sanitizeSearchQuery, type PortalSearchResponse, type SearchHit } from './buscar';

type Role = string;
const LIMIT = 5;
const has = (roles: readonly Role[], allowed: readonly Role[]) => roles.some(role => allowed.includes(role));

async function searchOrders(query: string): Promise<SearchHit[]> {
  const supabase = await createServerSupabaseClient();
  const pattern = `%${query}%`;
  const companies = query.length >= 3
    ? await supabase.from('empresas').select('id').ilike('nombre', pattern).limit(20)
    : { data: [] as { id: string }[], error: null };
  if (companies.error) throw new Error(companies.error.message);
  const select = 'id, numero, estado, created_at, empresa:empresas(nombre)';
  const [byNumber, byCompany] = await Promise.all([
    supabase.from('pedidos').select(select).ilike('numero', pattern).order('created_at', { ascending: false }).limit(LIMIT),
    companies.data?.length
      ? supabase.from('pedidos').select(select).in('empresa_id', companies.data.map(row => row.id)).order('created_at', { ascending: false }).limit(LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byNumber.error) throw new Error(byNumber.error.message);
  if (byCompany.error) throw new Error(byCompany.error.message);
  const seen = new Set<string>();
  return [...(byNumber.data ?? []), ...(byCompany.data ?? [])].flatMap(row => {
    if (seen.has(row.id)) return [];
    seen.add(row.id);
    const company = Array.isArray(row.empresa) ? row.empresa[0] : row.empresa;
    return [{
      kind: 'pedido' as const, id: row.id, title: row.numero ?? 'Pedido sin número',
      subtitle: [company?.nombre, getEstadoLabel(row.estado)].filter(Boolean).join(' · ') || null, href: `/dashboard/pedidos/${row.id}`,
    }];
  }).slice(0, LIMIT);
}

async function searchPortalCompanies(query: string): Promise<SearchHit[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('empresas').select('id, nombre').ilike('nombre', `%${query}%`).order('nombre').limit(LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({ kind: 'cliente' as const, id: row.id, title: row.nombre, subtitle: 'Cliente del portal', href: `/dashboard/clientes/${row.id}` }));
}

async function searchOdooCustomers(query: string): Promise<SearchHit[]> {
  return (await searchCustomers(query)).slice(0, LIMIT).map(customer => ({
    kind: 'cliente_odoo' as const, id: String(customer.id), title: customer.name,
    subtitle: ['Odoo · ver productos comprados', customer.vat ? `NIT ${customer.vat}` : null].filter(Boolean).join(' · '),
    href: `/dashboard/productos-cliente?cliente=${customer.id}`,
  }));
}

async function searchProducts(query: string): Promise<SearchHit[]> {
  const config = await getServerOdooConfig();
  if (!config) throw new Error('No está configurada la conexión Odoo.');
  const session = await authenticate(config);
  const rows = await searchRead('product.product', ['|', ['name', 'ilike', query], ['default_code', 'ilike', query]], ['id', 'display_name', 'default_code'], {
    limit: LIMIT, order: 'default_code, id', session,
  }) as Record<string, unknown>[];
  return rows.map(row => ({
    kind: 'producto' as const, id: String(row.id), title: String(row.display_name ?? '').replace(/^\[[^\]]*\]\s*/, ''),
    subtitle: [typeof row.default_code === 'string' && row.default_code ? `SKU ${row.default_code}` : null, 'Historial de compras'].filter(Boolean).join(' · '),
    href: `/dashboard/compras?producto=${row.id}`,
  }));
}

/** Búsqueda del ⌘K: cada fuente respeta el rol (y la RLS de la sesión para datos del portal). */
export async function searchPortal(roles: readonly Role[], rawQuery: string): Promise<PortalSearchResponse> {
  const query = sanitizeSearchQuery(rawQuery);
  const empty: PortalSearchResponse = { query, pedidos: [], clientes: [], clientesOdoo: [], productos: [], warnings: [] };
  if (query.length < MIN_SEARCH_LENGTH) return empty;
  const sources: [keyof Omit<PortalSearchResponse, 'query' | 'warnings'>, string, (() => Promise<SearchHit[]>) | null][] = [
    ['pedidos', 'pedidos', has(roles, ['super_admin', 'direccion', 'asesor', 'compras']) ? () => searchOrders(query) : null],
    ['clientes', 'clientes del portal', has(roles, ['super_admin', 'direccion', 'asesor']) ? () => searchPortalCompanies(query) : null],
    ['clientesOdoo', 'clientes de Odoo', has(roles, ['super_admin', 'direccion']) ? () => searchOdooCustomers(query) : null],
    ['productos', 'productos', has(roles, ['super_admin', 'direccion', 'asesor', 'compras']) ? () => searchProducts(query) : null],
  ];
  const settled = await Promise.allSettled(sources.map(([, , run]) => (run ? run() : Promise.resolve([]))));
  const response = { ...empty };
  settled.forEach((result, index) => {
    const [key, label] = sources[index];
    if (result.status === 'fulfilled') response[key] = result.value;
    else response.warnings.push(`No se pudieron consultar ${label}.`);
  });
  return response;
}
