import 'server-only';

import type { AuthorizedApiContext } from '@/lib/auth/apiRouteGuards';
import { userHasAnyRole } from '@/lib/auth/roles';
import { FinancialDataError, getFinancialReport } from '@/lib/gerencia/finanzas.server';
import { getBogotaCalendarDate } from './bonoPlataforma';
import { nextCommissionMonth, regularCommissionPeriod, summarizeRegularCommissions, type RegularCommissionReport } from './habitual';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveRegularCommissionScope(context: AuthorizedApiContext, requestedAdvisorId: string | null) {
  if (!userHasAnyRole(context.actor, ['asesor', 'direccion', 'super_admin'])) throw new FinancialDataError('No tienes acceso a las comisiones.', 403);
  const canViewTeam = userHasAnyRole(context.actor, ['direccion', 'super_admin']);
  const requested = requestedAdvisorId === 'all' ? null : requestedAdvisorId?.toLowerCase() ?? null;
  if (requested !== null && !UUID.test(requested)) throw new FinancialDataError('La asesora solicitada no es válida.', 400);
  if (!canViewTeam && requested !== null && requested !== context.actor.id) throw new FinancialDataError('Solo puedes consultar tu propia comisión.', 403);
  const advisorId = canViewTeam ? requested : context.actor.id;
  if (advisorId === null) return { canViewTeam, advisorId, odooUserId: undefined };
  const { data, error } = await context.admin.from('usuarios').select('id, rol, activo, odoo_user_id').eq('id', advisorId).maybeSingle();
  if (error) throw new FinancialDataError('No se pudo verificar la asesora.');
  if (!data || (!canViewTeam && !data.activo)) throw new FinancialDataError('No se encontró la asesora habilitada.', 404);
  if (data.rol !== 'asesor') {
    const extra = await context.admin.from('usuario_roles_extra').select('usuario_id')
      .eq('usuario_id', advisorId).eq('rol', 'asesor').eq('activo', true).maybeSingle();
    if (extra.error) throw new FinancialDataError('No se pudo verificar el rol comercial.');
    if (!extra.data) throw new FinancialDataError('El usuario no está habilitado como asesora.', 404);
  }
  if (!Number.isSafeInteger(data.odoo_user_id) || data.odoo_user_id <= 0) throw new FinancialDataError('La asesora no tiene un vendedor Odoo vinculado.', 409);
  if (!canViewTeam) {
    const others = await context.admin.from('usuarios').select('id', { count: 'exact', head: true })
      .eq('odoo_user_id', data.odoo_user_id).eq('activo', true).neq('id', advisorId);
    if (others.error) throw new FinancialDataError('No se pudo verificar el vínculo con Odoo.');
    if (others.count !== 0) throw new FinancialDataError('El vendedor Odoo está vinculado a más de un usuario. Solicita revisar la asignación.', 409);
  }
  return { canViewTeam, advisorId, odooUserId: Number(data.odoo_user_id) };
}

export async function getRegularCommissionReport(context: AuthorizedApiContext, period: string, requestedAdvisorId: string | null): Promise<RegularCommissionReport> {
  const scope = await resolveRegularCommissionScope(context, requestedAdvisorId);
  const today = getBogotaCalendarDate();
  let range;
  try { range = regularCommissionPeriod(period, today); }
  catch (error) { throw new FinancialDataError(error instanceof Error ? error.message : 'Período no válido.', 400); }
  const report = await getFinancialReport(context.admin, range, { advisorId: scope.odooUserId, page: 1 });
  const advisors = report.advisors.map(advisor => {
    if (!advisor.commissionBreakdown) throw new FinancialDataError('No se pudo confirmar el desglose de una asesora.');
    return { id: advisor.id, name: advisor.name, portalAdvisorId: advisor.portalAdvisorId ?? null, breakdown: advisor.commissionBreakdown };
  });
  if (!advisors.length && report.selectedAdvisor) {
    advisors.push({ ...report.selectedAdvisor, breakdown: summarizeRegularCommissions([]) });
  }
  return {
    period, paymentPeriod: nextCommissionMonth(range.from), range,
    completeMonth: period < today.slice(0, 7),
    currency: 'COP', generatedAt: report.generatedAt,
    advisorId: scope.advisorId, canViewTeam: scope.canViewTeam,
    breakdown: report.commissionBreakdown, advisors, payments: report.packagingPayments,
  };
}
