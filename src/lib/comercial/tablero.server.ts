import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticate, readGroup, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import { FinancialDataError, getOdooReportCompany } from '@/lib/gerencia/finanzas.server';
import { percentChange, samePeriod, shiftMonth } from '@/lib/gerencia/resumen';
import {
  clientAlert, goalProgress, monthProjection, purchasePattern, trendStatus, type ClientAlert, type PurchasePattern, type TrendStatus,
} from './tablero';

export interface AdvisorRef { id: string; name: string; odooUserId: number }
export interface SalesSnapshot {
  sales: number; documents: number; previousMonth: number; previousYear: number;
  changeVsPreviousMonth: number | null; changeVsPreviousYear: number | null; trend: TrendStatus | null;
  goal: number | null; goalProgress: number | null; projection: number;
}
export interface ClientAction { estado: string; nota: string | null; fecha: string; autor: string | null; valor: number | null }
export interface ClientRow {
  partnerId: number; name: string; lastPurchase: string | null; purchases: number; sales12m: number;
  boughtThisMonth: boolean; pattern: PurchasePattern | null; alert: ClientAlert | null; lastAction: ClientAction | null;
}
export interface ClientCounts { assigned: number; boughtThisMonth: number; active: number; followUp: number; priority: number; withoutPurchases: number }
export interface AdvisorBoard {
  advisor: AdvisorRef; today: string; sales: SalesSnapshot; clients: ClientCounts;
  alerts: ClientRow[]; frequentInactive: ClientRow[]; features: { gestion: boolean };
}

const HISTORY_DAYS = 548;
const FREQUENT_MIN_PURCHASES = 6;
const cache = new Map<string, { expires: number; promise: Promise<AdvisorBoard[]> }>();
let trackingCache: { value: boolean; expires: number } | null = null;
const fullName = (row: { nombre?: string | null; apellido?: string | null } | null | undefined) => [row?.nombre, row?.apellido].filter(Boolean).join(' ').trim();
const relationId = (value: unknown) => (Array.isArray(value) && Number.isSafeInteger(value[0]) ? Number(value[0]) : null);
const money = (value: unknown) => roundCurrency(typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** ¿Está aplicada la migración 057 (metas, gestión de alertas y umbrales)? */
export async function commercialTrackingEnabled(admin: SupabaseClient): Promise<boolean> {
  if (trackingCache && trackingCache.expires > Date.now()) return trackingCache.value;
  // Consulta normal (no `head`): con `head` Supabase no informa error cuando la tabla no existe.
  const checks = await Promise.all(['metas_comerciales', 'alertas_clientes_gestion', 'alertas_clientes_umbral']
    .map((table) => admin.from(table).select('*').limit(1)));
  const value = checks.every((check) => !check.error);
  trackingCache = { value, expires: Date.now() + (value ? 300_000 : 30_000) };
  return value;
}

/** Asesoras activas (rol principal o extra) con vendedor Odoo vinculado. */
export async function loadCommercialAdvisors(admin: SupabaseClient): Promise<AdvisorRef[]> {
  const [primary, extra] = await Promise.all([
    admin.from('usuarios').select('id, nombre, apellido, odoo_user_id').eq('rol', 'asesor').eq('activo', true).not('odoo_user_id', 'is', null),
    admin.from('usuario_roles_extra').select('usuario:usuarios!inner(id, nombre, apellido, odoo_user_id, activo)').eq('rol', 'asesor').eq('activo', true),
  ]);
  if (primary.error) throw new FinancialDataError('No se pudieron leer las asesoras.');
  const advisors = new Map<string, AdvisorRef>();
  const add = (row: { id: string; nombre: string | null; apellido: string | null; odoo_user_id: number | null } | undefined) => {
    if (row && Number.isSafeInteger(row.odoo_user_id) && Number(row.odoo_user_id) > 0) advisors.set(row.id, { id: row.id, name: fullName(row) || 'Asesora', odooUserId: Number(row.odoo_user_id) });
  };
  (primary.data ?? []).forEach(add);
  for (const row of extra.data ?? []) {
    const user = (Array.isArray(row.usuario) ? row.usuario[0] : row.usuario) as { id: string; nombre: string | null; apellido: string | null; odoo_user_id: number | null; activo: boolean } | undefined;
    if (user?.activo) add(user);
  }
  return [...advisors.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function searchAll(session: OdooSession, model: string, domain: unknown[], fields: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (let lastId = 0; ;) {
    const page = await searchRead(model, [...domain, ['id', '>', lastId]], fields, { session, limit: 1000, order: 'id asc' });
    rows.push(...page);
    if (page.length < 1000) return rows;
    lastId = Number(page[page.length - 1].id);
  }
}

async function buildBoards(admin: SupabaseClient, advisors: AdvisorRef[], today: string): Promise<AdvisorBoard[]> {
  const config = await getServerOdooConfig();
  if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
  const session = await authenticate(config);
  const company = await getOdooReportCompany(session);
  const userIds = [...new Set(advisors.map((advisor) => advisor.odooUserId))];
  const month = today.slice(0, 7);
  const invoices = (from: string, to: string) => [
    ['company_id', '=', company.id], ['state', '=', 'posted'], ['move_type', 'in', ['out_invoice', 'out_refund']],
    ['invoice_date', '>=', from], ['invoice_date', '<=', to], ['invoice_user_id', 'in', userIds],
  ];
  const previousMonth = samePeriod(today, -1);
  const previousYear = samePeriod(today, -12);
  const historyFrom = new Date(Date.parse(`${today}T00:00:00Z`) - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  const salesFrom = `${shiftMonth(month, -11)}-01`;
  const tracking = await commercialTrackingEnabled(admin).catch(() => false);

  const [currentRows, previousMonthRows, previousYearRows, partners, history] = await Promise.all([
    readGroup('account.move', invoices(`${month}-01`, today), ['amount_untaxed_signed:sum'], ['invoice_user_id'], { session }),
    readGroup('account.move', invoices(previousMonth.from, previousMonth.to), ['amount_untaxed_signed:sum'], ['invoice_user_id'], { session }),
    readGroup('account.move', invoices(previousYear.from, previousYear.to), ['amount_untaxed_signed:sum'], ['invoice_user_id'], { session }),
    searchAll(session, 'res.partner', [['user_id', 'in', userIds], ['customer_rank', '>', 0], ['parent_id', '=', false]], ['id', 'name', 'user_id']),
    readGroup('account.move', [
      ['company_id', '=', company.id], ['state', '=', 'posted'], ['move_type', '=', 'out_invoice'], ['invoice_date', '>=', historyFrom], ['invoice_date', '<=', today],
      ['commercial_partner_id.user_id', 'in', userIds],
    ], ['amount_untaxed_signed:sum'], ['commercial_partner_id', 'invoice_date:day'], { session }),
  ]);
  const byUser = (rows: Record<string, unknown>[]) => new Map(rows.map((row) => [relationId(row.invoice_user_id), { sales: money(row.amount_untaxed_signed), documents: Number(row.__count ?? 0) }]));
  const [current, lastMonth, lastYear] = [byUser(currentRows), byUser(previousMonthRows), byUser(previousYearRows)];

  const purchases = new Map<number, { dates: string[]; sales12m: number }>();
  for (const row of history) {
    const partnerId = relationId(row.commercial_partner_id);
    const day = (row.__range as Record<string, { from?: string }> | undefined)?.['invoice_date:day']?.from?.slice(0, 10);
    if (!partnerId || !day) continue;
    const entry = purchases.get(partnerId) ?? { dates: [], sales12m: 0 };
    entry.dates.push(day);
    if (day >= salesFrom) entry.sales12m = roundCurrency(entry.sales12m + money(row.amount_untaxed_signed));
    purchases.set(partnerId, entry);
  }

  const partnerIds = partners.map((partner) => Number(partner.id));
  const [goals, thresholds, actions] = tracking ? await Promise.all([
    admin.from('metas_comerciales').select('asesor_id, valor').eq('mes', `${month}-01`),
    admin.from('alertas_clientes_umbral').select('odoo_partner_id, dias_seguimiento, dias_prioritaria').in('odoo_partner_id', partnerIds.length ? partnerIds : [0]),
    admin.from('alertas_clientes_gestion').select('odoo_partner_id, estado, nota, valor_oportunidad, created_at, usuario:usuarios!alertas_clientes_gestion_usuario_id_fkey(nombre, apellido)')
      .in('odoo_partner_id', partnerIds.length ? partnerIds : [0]).order('created_at', { ascending: false }).limit(5000),
  ]) : [null, null, null];
  const goalByAdvisor = new Map((goals?.data ?? []).map((row) => [row.asesor_id as string, Number(row.valor)]));
  const thresholdByPartner = new Map((thresholds?.data ?? []).map((row) => [Number(row.odoo_partner_id), { followUpDays: Number(row.dias_seguimiento), priorityDays: Number(row.dias_prioritaria) }]));
  const actionByPartner = new Map<number, ClientAction>();
  for (const row of actions?.data ?? []) {
    const partnerId = Number(row.odoo_partner_id);
    if (actionByPartner.has(partnerId)) continue;
    const user = Array.isArray(row.usuario) ? row.usuario[0] : row.usuario;
    actionByPartner.set(partnerId, { estado: row.estado, nota: row.nota, fecha: row.created_at, autor: fullName(user as { nombre?: string | null; apellido?: string | null } | null) || null, valor: row.valor_oportunidad === null ? null : Number(row.valor_oportunidad) });
  }

  return advisors.map((advisor) => {
    const rows: ClientRow[] = partners.filter((partner) => relationId(partner.user_id) === advisor.odooUserId).map((partner) => {
      const partnerId = Number(partner.id);
      const entry = purchases.get(partnerId);
      const dates = [...new Set(entry?.dates ?? [])].sort();
      const pattern = purchasePattern(dates);
      const lastPurchase = dates.at(-1) ?? null;
      return {
        partnerId, name: String(partner.name ?? 'Cliente'), lastPurchase, purchases: dates.length, sales12m: entry?.sales12m ?? 0,
        boughtThisMonth: Boolean(lastPurchase && lastPurchase >= `${month}-01`), pattern,
        alert: lastPurchase ? clientAlert(lastPurchase, today, pattern, thresholdByPartner.get(partnerId)) : null,
        lastAction: actionByPartner.get(partnerId) ?? null,
      };
    });
    const level = (value: string) => rows.filter((row) => row.alert?.level === value).length;
    const sales = current.get(advisor.odooUserId)?.sales ?? 0;
    const previousMonthSales = lastMonth.get(advisor.odooUserId)?.sales ?? 0;
    const goal = goalByAdvisor.get(advisor.id) ?? null;
    const changeVsPreviousMonth = percentChange(sales, previousMonthSales);
    const alerts = rows.filter((row) => row.alert && row.alert.level !== 'al_dia')
      .sort((a, b) => Number(b.alert!.level === 'prioritaria') - Number(a.alert!.level === 'prioritaria') || b.sales12m - a.sales12m);
    return {
      advisor, today,
      sales: {
        sales, documents: current.get(advisor.odooUserId)?.documents ?? 0, previousMonth: previousMonthSales, previousYear: lastYear.get(advisor.odooUserId)?.sales ?? 0,
        changeVsPreviousMonth, changeVsPreviousYear: percentChange(sales, lastYear.get(advisor.odooUserId)?.sales ?? 0), trend: trendStatus(changeVsPreviousMonth),
        goal, goalProgress: goalProgress(sales, goal), projection: monthProjection(sales, today),
      },
      clients: {
        assigned: rows.length, boughtThisMonth: rows.filter((row) => row.boughtThisMonth).length, active: level('al_dia'),
        followUp: level('seguimiento'), priority: level('prioritaria'), withoutPurchases: rows.filter((row) => !row.lastPurchase).length,
      },
      alerts,
      frequentInactive: alerts.filter((row) => row.purchases >= FREQUENT_MIN_PURCHASES).slice(0, 10),
      features: { gestion: tracking },
    };
  });
}

/**
 * Tableros de las asesoras indicadas (todas si no se indica). Se calcula siempre el equipo completo con
 * las mismas lecturas de Odoo y se comparte la caché de 5 minutos entre la vista de equipo y la de cada asesora.
 */
export async function loadCommercialBoards(admin: SupabaseClient, advisorIds?: string[], useCache = true): Promise<AdvisorBoard[]> {
  const today = getBogotaCalendarDate();
  const advisors = await loadCommercialAdvisors(admin);
  const pick = (boards: AdvisorBoard[]) => boards.filter((board) => !advisorIds || advisorIds.includes(board.advisor.id));
  if (advisors.length === 0) return [];
  const key = `${today}:${advisors.map((advisor) => `${advisor.id}=${advisor.odooUserId}`).join(',')}`;
  const previous = cache.get(key);
  if (useCache && previous && previous.expires > Date.now()) return pick(await previous.promise);
  const promise = buildBoards(admin, advisors, today);
  if (cache.size >= 4) cache.delete(cache.keys().next().value!);
  const entry = { expires: Infinity, promise };
  cache.set(key, entry);
  try {
    const boards = await promise;
    entry.expires = Date.now() + 300_000;
    return pick(boards);
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  }
}

export function clearCommercialBoardCache() {
  cache.clear();
}
