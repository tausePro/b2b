import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticate, read, searchRead, type OdooSession } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import {
  calculatePlatformBonus,
  getCommissionPeriodRange,
  getInvoiceLineBase,
  PLATFORM_BONUS_PERCENT,
  PLATFORM_BONUS_START_DATE,
  roundCurrency,
  summarizePlatformBonus,
  type CommissionDocumentType,
  type EligiblePlatformClient,
  type PlatformBonusDetail,
  type PlatformBonusTotals,
  type PlatformBonusClientSummary,
} from '@/lib/comisiones/bonoPlataforma';

type AdvisorRow = { id: string; nombre: string; apellido: string; odoo_user_id: number | null };
type AssignmentRow = { usuario_id: string; empresa_id: string; bono_plataforma_desde: string };
type CompanyRow = { id: string; nombre: string; activa: boolean };
type PortalOrderRow = { id: string; empresa_id: string; odoo_sale_order_id: number; fecha_creacion: string };
type SaleLineReference = { companyId: string; orderId: string; saleOrderId: number; cancelled: boolean };

export interface PlatformBonusAdvisorCalculation {
  advisor: { id: string; name: string; odooUserId: number | null };
  period: string;
  periodDate: string;
  percentage: number;
  clients: PlatformBonusClientSummary[];
  details: PlatformBonusDetail[];
  totals: PlatformBonusTotals;
  warnings: string[];
  blockingIssues: string[];
}

export function getPlatformBonusCalculationHash(calculation: PlatformBonusAdvisorCalculation): string {
  return createHash('sha256').update(JSON.stringify({
    advisor: calculation.advisor,
    period: calculation.period,
    percentage: calculation.percentage,
    totals: calculation.totals,
    clients: [...calculation.clients].sort((a, b) => a.id.localeCompare(b.id)),
    details: [...calculation.details].map((detail) => ({
      ...detail,
      orderIds: [...detail.orderIds].sort(),
      saleOrderIds: [...detail.saleOrderIds].sort((a, b) => a - b),
      invoiceLineIds: [...detail.invoiceLineIds].sort((a, b) => a - b),
    })).sort((a, b) => a.companyId.localeCompare(b.companyId) || a.invoiceId - b.invoiceId),
    blockingIssues: [...calculation.blockingIssues].sort(),
  })).digest('hex');
}

async function readOdooInChunks(session: OdooSession, model: string, ids: number[], fields: string[]) {
  const rows: Record<string, unknown>[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    rows.push(...await read(model, uniqueIds.slice(index, index + 100), fields, session));
  }
  if (rows.length !== uniqueIds.length) throw new Error(`Odoo devolvió registros incompletos de ${model}.`);
  return rows;
}

async function searchAllOdoo(session: OdooSession, model: string, domain: unknown[], fields: string[]) {
  const rows: Record<string, unknown>[] = [];
  let lastId = 0;
  for (;;) {
    const page = await searchRead(model, [...domain, ['id', '>', lastId]], fields, { session, limit: 500, order: 'id asc' });
    rows.push(...page);
    if (page.length < 500) return rows;
    lastId = Number(page[page.length - 1].id);
  }
}

export async function loadPortalBonusOrders(admin: SupabaseClient, companyIds: string[]): Promise<PortalOrderRow[]> {
  const rows: PortalOrderRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from('pedidos')
      .select('id, empresa_id, odoo_sale_order_id, fecha_creacion')
      .in('empresa_id', companyIds).not('odoo_sale_order_id', 'is', null)
      .order('id').range(offset, offset + 499);
    if (error) throw error;
    const page = (data ?? []) as PortalOrderRow[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function relationId(value: unknown): number | null {
  return Array.isArray(value) && Number.isSafeInteger(value[0]) && value[0] > 0 ? value[0] : null;
}

function relationName(value: unknown): string | null {
  return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null;
}

function numericIds(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id) => Number.isSafeInteger(id) && id > 0) : [];
}

export async function calculatePlatformBonuses(params: {
  admin: SupabaseClient;
  period: string;
  advisorIds?: string[];
  includeInactiveAdvisors?: boolean;
}): Promise<PlatformBonusAdvisorCalculation[]> {
  const { admin, period, advisorIds, includeInactiveAdvisors = false } = params;
  const range = getCommissionPeriodRange(period);
  if (advisorIds?.length === 0) return [];
  let advisorQuery = admin.from('usuarios').select('id, nombre, apellido, odoo_user_id')
    .eq('rol', 'asesor').order('nombre');
  if (!includeInactiveAdvisors) advisorQuery = advisorQuery.eq('activo', true);
  const [advisorResult, extraResult] = await Promise.all([
    advisorQuery,
    admin.from('usuario_roles_extra').select('usuario_id').eq('rol', 'asesor').eq('activo', true),
  ]);
  if (advisorResult.error) throw advisorResult.error;
  if (extraResult.error) throw extraResult.error;
  const advisorById = new Map((advisorResult.data ?? []).map((advisor) => [advisor.id, advisor]));
  const extraIds = (extraResult.data ?? []).map((row) => row.usuario_id).filter((id) => !advisorById.has(id));
  if (extraIds.length) {
    let extraQuery = admin.from('usuarios').select('id, nombre, apellido, odoo_user_id').in('id', extraIds);
    if (!includeInactiveAdvisors) extraQuery = extraQuery.eq('activo', true);
    const { data, error } = await extraQuery;
    if (error) throw error;
    for (const advisor of data ?? []) advisorById.set(advisor.id, advisor);
  }
  const advisors = [...advisorById.values()];
  if (!advisors.length) return [];

  const { data: assignments, error: assignmentError } = await admin.from('asesor_empresas')
    .select('usuario_id, empresa_id, bono_plataforma_desde')
    .in('usuario_id', advisors.map((advisor) => advisor.id))
    .eq('activo', true).eq('bono_plataforma_activo', true).lte('bono_plataforma_desde', range.endDate);
  if (assignmentError) throw assignmentError;
  const companyIds = [...new Set((assignments ?? []).map((assignment) => assignment.empresa_id))];
  const input = { advisors, assignments: assignments ?? [], period, advisorIds };
  if (!companyIds.length) return calculateOdooPlatformBonuses({ ...input, companies: [], portalOrders: [] });

  const [companyResult, membershipResult] = await Promise.all([
    admin.from('empresas').select('id, nombre, activa').in('id', companyIds).eq('activa', true),
    admin.from('usuario_empresas')
      .select('empresa_id, usuario:usuarios!usuario_empresas_usuario_id_fkey!inner(id, activo, rol)')
      .in('empresa_id', companyIds).eq('activo', true).eq('usuario.activo', true)
      .in('usuario.rol', ['comprador', 'aprobador']),
  ]);
  if (companyResult.error) throw companyResult.error;
  if (membershipResult.error) throw membershipResult.error;
  const companiesWithUsers = new Set((membershipResult.data ?? []).map((membership) => membership.empresa_id));
  const companies = (companyResult.data ?? []).filter((company) => companiesWithUsers.has(company.id));
  const portalOrders = companies.length ? await loadPortalBonusOrders(admin, companies.map((company) => company.id)) : [];
  return calculateOdooPlatformBonuses({ ...input, companies, portalOrders });
}

export async function calculateOdooPlatformBonuses(params: {
  advisors: AdvisorRow[];
  assignments: AssignmentRow[];
  companies: CompanyRow[];
  portalOrders: PortalOrderRow[];
  period: string;
  advisorIds?: string[];
  session?: OdooSession;
}): Promise<PlatformBonusAdvisorCalculation[]> {
  const { advisors, assignments, portalOrders, period } = params;
  const range = getCommissionPeriodRange(period);
  const companies = new Map(params.companies.filter((company) => company.activa).map((company) => [company.id, company]));
  const clientsByAdvisor = new Map<string, EligiblePlatformClient[]>();
  const assignmentsByCompany = new Map<string, AssignmentRow[]>();
  for (const assignment of assignments) {
    const company = companies.get(assignment.empresa_id);
    if (!company || assignment.bono_plataforma_desde > range.endDate) continue;
    const clients = clientsByAdvisor.get(assignment.usuario_id) ?? [];
    const bonusStartDate = assignment.bono_plataforma_desde > PLATFORM_BONUS_START_DATE
      ? assignment.bono_plataforma_desde : PLATFORM_BONUS_START_DATE;
    clients.push({ id: company.id, name: company.nombre, bonusStartDate });
    clientsByAdvisor.set(assignment.usuario_id, clients);
    const current = assignmentsByCompany.get(company.id) ?? [];
    current.push({ ...assignment, bono_plataforma_desde: bonusStartDate });
    assignmentsByCompany.set(company.id, current);
  }

  const warnings = new Map<string, Set<string>>();
  const issues = new Map<string, Set<string>>();
  const detailsByAdvisor = new Map<string, PlatformBonusDetail[]>();
  const notify = (companyId: string, message: string, blocking = true) => {
    const target = blocking ? issues : warnings;
    for (const assignment of assignmentsByCompany.get(companyId) ?? []) {
      const current = target.get(assignment.usuario_id) ?? new Set<string>();
      current.add(message);
      target.set(assignment.usuario_id, current);
    }
  };
  const finish = (): PlatformBonusAdvisorCalculation[] => advisors
    .filter((advisor) => !params.advisorIds || params.advisorIds.includes(advisor.id))
    .map((advisor) => {
    const details = (detailsByAdvisor.get(advisor.id) ?? [])
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceId - a.invoiceId);
    const summary = summarizePlatformBonus(clientsByAdvisor.get(advisor.id) ?? [], details);
    const blockingIssues = [...(issues.get(advisor.id) ?? [])];
    for (const client of summary.clients) {
      if (client.invoicedBase < client.creditNotes || client.invoicedBase < 0 || client.creditNotes < 0) {
        blockingIssues.push(`${client.name}: los ajustes exceden la base del periodo. Dirección debe revisar el saldo antes del cierre.`);
      }
    }
    return {
      advisor: { id: advisor.id, name: [advisor.nombre, advisor.apellido].filter(Boolean).join(' '), odooUserId: advisor.odoo_user_id },
      period, periodDate: range.periodDate, percentage: PLATFORM_BONUS_PERCENT,
      ...summary, details, warnings: [...(warnings.get(advisor.id) ?? [])], blockingIssues,
    };
  });
  if (!portalOrders.length || !companies.size) return finish();

  const config = params.session ? null : await getServerOdooConfig();
  if (!params.session && !config) throw new Error('No hay configuración Odoo disponible para liquidar el bono.');
  const session = params.session ?? await authenticate(config!);
  const orderBySaleId = new Map<number, PortalOrderRow>();
  for (const order of portalOrders) {
    const id = Number(order.odoo_sale_order_id);
    if (orderBySaleId.has(id)) throw new Error('Hay órdenes Odoo vinculadas a más de un pedido del portal.');
    orderBySaleId.set(id, order);
  }
  const saleOrders = await readOdooInChunks(session, 'sale.order', [...orderBySaleId.keys()], ['id', 'order_line', 'invoice_ids', 'state']);
  const references = new Map<number, SaleLineReference>();
  const invoiceIds = new Set<number>();
  const saleCompanies = new Map<number, Set<string>>();
  for (const sale of saleOrders) {
    const order = orderBySaleId.get(Number(sale.id))!;
    for (const lineId of numericIds(sale.order_line)) {
      references.set(lineId, { companyId: order.empresa_id, orderId: order.id, saleOrderId: Number(sale.id), cancelled: sale.state === 'cancel' });
    }
    for (const id of numericIds(sale.invoice_ids)) {
      invoiceIds.add(id);
      const current = saleCompanies.get(id) ?? new Set<string>();
      current.add(order.empresa_id);
      saleCompanies.set(id, current);
    }
    if (!numericIds(sale.invoice_ids).length && order.fecha_creacion.slice(0, 7) === period) {
      notify(order.empresa_id, 'Hay pedidos del portal que aún no tienen factura publicada en Odoo.', false);
    }
  }
  if (!invoiceIds.size) return finish();

  const invoiceFields = ['id', 'name', 'state', 'move_type', 'invoice_date', 'invoice_user_id', 'company_currency_id', 'reversed_entry_id'];
  const documents = await readOdooInChunks(session, 'account.move', [...invoiceIds], invoiceFields);
  const originals = documents.filter((document) => document.move_type === 'out_invoice').map((document) => Number(document.id));
  for (let index = 0; index < originals.length; index += 100) {
    documents.push(...await searchAllOdoo(session, 'account.move', [
      ['reversed_entry_id', 'in', originals.slice(index, index + 100)], ['move_type', '=', 'out_refund'],
      ['state', '=', 'posted'], ['invoice_date', '>=', range.startDate], ['invoice_date', '<=', range.endDate],
    ], invoiceFields));
  }
  const invoiceById = new Map(documents.map((document) => [Number(document.id), document]));
  const missingOriginals = [...new Set(documents.map((document) => relationId(document.reversed_entry_id))
    .filter((id): id is number => id !== null && !invoiceById.has(id)))];
  for (const original of await readOdooInChunks(session, 'account.move', missingOriginals, invoiceFields)) {
    invoiceById.set(Number(original.id), original);
  }
  const currentInvoices = [...invoiceById.values()].filter((document) => document.state === 'posted'
    && ['out_invoice', 'out_refund'].includes(String(document.move_type))
    && typeof document.invoice_date === 'string' && document.invoice_date >= range.startDate && document.invoice_date <= range.endDate);
  const lines: Record<string, unknown>[] = [];
  const lineFields = ['id', 'move_id', 'sale_line_ids', 'display_type', 'product_id', 'tax_line_id', 'balance'];
  for (let index = 0; index < currentInvoices.length; index += 100) {
    lines.push(...await searchAllOdoo(session, 'account.move.line', [
      ['move_id', 'in', currentInvoices.slice(index, index + 100).map((invoice) => Number(invoice.id))],
      ['display_type', '=', 'product'],
    ], lineFields));
  }
  const grouped = new Map<string, PlatformBonusDetail & { advisorId: string }>();
  for (const line of lines) {
    const invoiceId = relationId(line.move_id);
    const invoice = invoiceId ? invoiceById.get(invoiceId) : null;
    if (!invoice || !invoiceId || line.display_type !== 'product' || relationId(line.tax_line_id)) continue;
    const refund = invoice.move_type === 'out_refund';
    const originalId = relationId(invoice.reversed_entry_id);
    const original = refund && originalId ? invoiceById.get(originalId) : invoice;
    if (refund && original && typeof original.invoice_date === 'string' && original.invoice_date < PLATFORM_BONUS_START_DATE) continue;

    const saleLineIds = numericIds(line.sale_line_ids);
    const linked = saleLineIds.map((id) => references.get(id)).filter((ref): ref is SaleLineReference => Boolean(ref));
    const candidateCompanies = new Set(linked.map((ref) => ref.companyId));
    if (!linked.length) {
      if (refund || Number(line.balance) > 0) {
        for (const companyId of saleCompanies.get(originalId ?? invoiceId) ?? []) {
          notify(companyId, `${String(invoice.name)}: ajuste sin vínculo a líneas del portal; requiere conciliación en Odoo.`);
        }
      }
      continue;
    }
    if (linked.length !== saleLineIds.length || candidateCompanies.size !== 1) {
      for (const companyId of candidateCompanies) notify(companyId, `${String(invoice.name)}: una línea mezcla varios orígenes; no se prorratea automáticamente.`);
      continue;
    }
    const companyId = linked[0].companyId;
    if (!companies.has(companyId)) continue;
    if (refund && (!originalId || !original || original.move_type !== 'out_invoice' || original.state !== 'posted')) {
      notify(companyId, `${String(invoice.name)}: no se pudo comprobar la factura original de la nota crédito.`);
      continue;
    }
    if (!refund && linked.some((ref) => ref.cancelled)) {
      notify(companyId, `${String(invoice.name)}: la orden está cancelada y la factura publicada; requiere revisión.`);
      continue;
    }
    if (relationName(invoice.company_currency_id) !== 'COP') {
      notify(companyId, `${String(invoice.name)}: moneda de compañía distinta de COP o no verificada.`);
      continue;
    }
    const salespersonId = relationId(original?.invoice_user_id);
    const candidates = advisors.filter((item) => item.odoo_user_id === salespersonId && salespersonId !== null);
    const advisor = candidates.length === 1 ? candidates[0] : null;
    const assignment = advisor && (assignmentsByCompany.get(companyId) ?? []).find((item) => item.usuario_id === advisor.id);
    if (!assignment || !advisor) {
      notify(companyId, `${String(invoice.name)}: comercial Odoo sin una asignación elegible; requiere revisión.`);
      continue;
    }
    const eligibilityDate = String(original?.invoice_date ?? '');
    if (!eligibilityDate || eligibilityDate < assignment.bono_plataforma_desde) continue;
    const key = `${advisor.id}:${companyId}:${invoiceId}`;
    const detail = grouped.get(key) ?? {
      advisorId: advisor.id, companyId, companyName: companies.get(companyId)!.nombre,
      invoiceId, invoiceName: typeof invoice.name === 'string' ? invoice.name : null,
      invoiceDate: String(invoice.invoice_date), documentType: invoice.move_type as CommissionDocumentType,
      currency: 'COP', netBase: 0, bonus: 0, orderIds: [], saleOrderIds: [], invoiceLineIds: [],
    };
    if (detail.invoiceLineIds.includes(Number(line.id))) throw new Error('Línea de factura duplicada.');
    detail.netBase = roundCurrency(detail.netBase + getInvoiceLineBase(line.balance));
    detail.orderIds = [...new Set([...detail.orderIds, ...linked.map((ref) => ref.orderId)])];
    detail.saleOrderIds = [...new Set([...detail.saleOrderIds, ...linked.map((ref) => ref.saleOrderId)])];
    detail.invoiceLineIds.push(Number(line.id));
    grouped.set(key, detail);
  }
  for (const { advisorId, ...detail } of grouped.values()) {
    detail.bonus = calculatePlatformBonus(detail.netBase);
    const current = detailsByAdvisor.get(advisorId) ?? [];
    current.push(detail);
    detailsByAdvisor.set(advisorId, current);
  }
  return finish();
}
