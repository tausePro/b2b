import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles, type AuthorizedApiContext } from '@/lib/auth/apiRouteGuards';
import { calculatePlatformBonuses, getPlatformBonusCalculationHash, type PlatformBonusAdvisorCalculation } from '@/lib/comisiones/bonoPlataforma.server';
import {
  getBogotaCalendarDate,
  getCommissionPeriodRange,
  PLATFORM_BONUS_PERCENT,
  type CommissionPeriodStatus,
  type PlatformBonusDetail,
} from '@/lib/comisiones/bonoPlataforma';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['asesor', 'direccion', 'super_admin'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_FIELDS = 'id, asesor_id, periodo, estado, version, updated_at, snapshot, snapshot_generado_at, cerrado_at, pagado_at, asesor_nombre, asesor_odoo_user_id';
const MIGRATION_ERROR_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

type AuditableCalculation = Omit<PlatformBonusAdvisorCalculation, 'details'> & {
  details: (PlatformBonusDetail & { invoiceLineIds: number[] })[];
  blockingIssues: string[];
  snapshotLegacy?: boolean;
};

type PeriodRow = {
  id: string;
  asesor_id: string;
  periodo: string;
  estado: CommissionPeriodStatus;
  version: number;
  updated_at: string;
  snapshot: AuditableCalculation | null;
  historial?: unknown[];
  snapshot_generado_at: string | null;
  cerrado_at: string | null;
  pagado_at: string | null;
};

type AdvisorRow = {
  id: string;
  nombre: string;
  apellido: string;
  odoo_user_id: number | null;
  activo: boolean;
};

class BonusApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly blockingIssues?: string[],
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  });
}

function authorizationFailure(response: NextResponse) {
  return json({
    error: response.status === 401 ? 'Debes iniciar sesión.' : 'No tienes permisos para consultar estas liquidaciones.',
    code: response.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
  }, response.status);
}

function failure(error: unknown, method: string) {
  if (error instanceof BonusApiError) {
    return json({ error: error.message, code: error.code, blockingIssues: error.blockingIssues }, error.status);
  }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (MIGRATION_ERROR_CODES.has(code)) {
    return json({
      error: 'Es necesario aplicar la migración del bono plataforma antes de usar esta función.',
      code: 'MIGRATION_REQUIRED',
    }, 503);
  }
  const rpcErrors: Record<string, [number, string, string]> = {
    PB400: [400, 'INVALID_REQUEST', 'La solicitud de liquidación no es válida.'],
    PB403: [403, 'FORBIDDEN', 'No tienes permisos para gestionar liquidaciones.'],
    PB404: [404, 'NOT_FOUND', 'No se encontró la liquidación o la asesora solicitada.'],
    PB409: [409, 'VERSION_CONFLICT', 'La liquidación cambió. Actualiza la vista y vuelve a confirmar.'],
    PB410: [409, 'INVALID_STATE', 'El estado de la liquidación no permite esta acción.'],
    PB411: [409, 'PERIOD_NOT_FINISHED', 'El periodo solo puede gestionarse después de terminar el mes.'],
    PB422: [422, 'SNAPSHOT_INVALID', 'Los detalles, identificadores o agregados de la liquidación son inconsistentes.'],
    PB423: [422, 'BLOCKING_ISSUES', 'El cálculo tiene incidencias bloqueantes y no puede cerrarse.'],
  };
  if (rpcErrors[code]) {
    const [status, responseCode, message] = rpcErrors[code];
    return json({ error: message, code: responseCode }, status);
  }
  console.error(`[Bono Plataforma ${method}]`, error);
  return json({ error: 'No se pudo procesar la liquidación del bono plataforma.', code: 'INTERNAL_ERROR' }, 500);
}

function hasGlobalAccess(context: AuthorizedApiContext): boolean {
  return [context.actor.rol, ...context.actor.rolesExtra]
    .some((role) => role === 'super_admin' || role === 'direccion');
}

function currentPeriod(): string {
  return getBogotaCalendarDate().slice(0, 7);
}

function validatePeriod(value: unknown) {
  if (typeof value !== 'string') {
    throw new BonusApiError(400, 'INVALID_PERIOD', 'El periodo debe tener formato AAAA-MM.');
  }
  let range: ReturnType<typeof getCommissionPeriodRange>;
  try {
    range = getCommissionPeriodRange(value);
  } catch {
    throw new BonusApiError(400, 'INVALID_PERIOD', 'Indica un periodo válido desde septiembre de 2026.');
  }
  if (range.period > currentPeriod()) {
    throw new BonusApiError(400, 'FUTURE_PERIOD', 'No se permiten periodos futuros.');
  }
  return range;
}

function validateAdvisorId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new BonusApiError(400, 'INVALID_ADVISOR_ID', 'El identificador de la asesora no es válido.');
  }
  return value.toLowerCase();
}

async function assertSchema(context: AuthorizedApiContext) {
  const checks = await Promise.all([
    context.admin.from('comision_periodos').select('id, version, snapshot, historial, asesor_nombre, asesor_odoo_user_id').limit(0),
    context.admin.from('comision_clientes').select('id, empresa_nombre').limit(0),
    context.admin.from('comision_detalles').select('id, empresa_nombre, odoo_invoice_line_ids').limit(0),
    context.admin.from('asesor_empresas').select('bono_plataforma_activo, bono_plataforma_desde').limit(0),
    context.admin.from('usuario_roles_extra').select('usuario_id, rol, activo').limit(0),
  ]);
  for (const check of checks) if (check.error) throw check.error;
}

async function getTargetAdvisors(
  context: AuthorizedApiContext,
  requestedAdvisorId: string | null,
  includeInactive = false,
): Promise<AdvisorRow[]> {
  const fields = 'id, nombre, apellido, odoo_user_id, activo';
  if (!hasGlobalAccess(context)) {
    const { data, error } = await context.admin.from('usuarios').select(fields)
      .eq('id', context.actor.id).eq('activo', true).maybeSingle();
    if (error) throw error;
    return data ? [data as AdvisorRow] : [];
  }
  let primaryQuery = context.admin.from('usuarios').select(fields).eq('rol', 'asesor').order('id');
  let extrasQuery = context.admin.from('usuario_roles_extra').select('usuario_id').eq('rol', 'asesor').eq('activo', true).order('usuario_id');
  if (!includeInactive) primaryQuery = primaryQuery.eq('activo', true);
  if (requestedAdvisorId) {
    primaryQuery = primaryQuery.eq('id', requestedAdvisorId);
    extrasQuery = extrasQuery.eq('usuario_id', requestedAdvisorId);
  }
  const advisors = new Map<string, AdvisorRow>();
  for (let offset = 0; ; offset += 1000) {
    const [{ data: primary, error: primaryError }, { data: extras, error: extrasError }] = await Promise.all([
      primaryQuery.range(offset, offset + 999), extrasQuery.range(offset, offset + 999),
    ]);
    if (primaryError) throw primaryError;
    if (extrasError) throw extrasError;
    for (const advisor of (primary ?? []) as AdvisorRow[]) advisors.set(advisor.id, advisor);
    const extraIds = (extras ?? []).map((row) => String(row.usuario_id)).filter((id) => !advisors.has(id));
    for (let start = 0; start < extraIds.length; start += 100) {
      let extraUsersQuery = context.admin.from('usuarios').select(fields).in('id', extraIds.slice(start, start + 100));
      if (!includeInactive) extraUsersQuery = extraUsersQuery.eq('activo', true);
      const { data, error } = await extraUsersQuery;
      if (error) throw error;
      for (const advisor of (data ?? []) as AdvisorRow[]) advisors.set(advisor.id, advisor);
    }
    if ((primary?.length ?? 0) < 1000 && (extras?.length ?? 0) < 1000) break;
  }
  return [...advisors.values()];
}

async function loadPeriods(
  context: AuthorizedApiContext,
  periodDate: string,
  advisorId: string | null,
  includeHistory = false,
): Promise<PeriodRow[]> {
  const rows: PeriodRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = context.admin.from('comision_periodos')
      .select(`${PERIOD_FIELDS}${includeHistory ? ', historial' : ''}`)
      .eq('periodo', periodDate).order('id').range(offset, offset + 999);
    if (!hasGlobalAccess(context)) query = query.eq('asesor_id', context.actor.id);
    else if (advisorId) query = query.eq('asesor_id', advisorId);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as unknown as PeriodRow[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function normalizeCalculation(calculation: PlatformBonusAdvisorCalculation): AuditableCalculation {
  const reportedIssues: unknown = 'blockingIssues' in calculation ? calculation.blockingIssues : undefined;
  const blockingIssues = Array.isArray(reportedIssues) && reportedIssues.every((issue) => typeof issue === 'string')
    ? [...reportedIssues] as string[]
    : ['El calculador no confirmó la verificación de incidencias bloqueantes.'];
  const details = calculation.details.map((detail) => {
    const ids: unknown = 'invoiceLineIds' in detail ? detail.invoiceLineIds : undefined;
    const validIds = Array.isArray(ids) && ids.length > 0
      && ids.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
      && new Set(ids).size === ids.length;
    if (!validIds) blockingIssues.push(`Falta trazabilidad de líneas en el documento ${detail.invoiceId}.`);
    return { ...detail, invoiceLineIds: validIds ? ids as number[] : [] };
  });
  if (calculation.percentage !== 0.5) blockingIssues.push('El porcentaje del bono debe ser exactamente 0,5%.');
  return { ...calculation, details, blockingIssues: [...new Set(blockingIssues)] };
}

function snapshotResult(row: PeriodRow) {
  if (!row.snapshot) throw new BonusApiError(422, 'SNAPSHOT_INVALID', 'La liquidación no conserva un snapshot completo.');
  return {
    ...row.snapshot,
    status: row.estado,
    source: 'snapshot' as const,
    calculationHash: null,
    periodId: row.id,
    version: row.version,
    updatedAt: row.updated_at,
    closedAt: row.cerrado_at,
    paidAt: row.pagado_at,
    generatedAt: row.snapshot_generado_at,
    ...(row.historial ? { history: row.historial } : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await authorizeApiRoles(ALLOWED_ROLES);
    if (authorized instanceof NextResponse) return authorizationFailure(authorized);
    const range = validatePeriod(request.nextUrl.searchParams.get('periodo') ?? currentPeriod());
    const advisorParam = request.nextUrl.searchParams.get('asesor_id');
    const advisorId = advisorParam === null ? null : validateAdvisorId(advisorParam);
    if (!hasGlobalAccess(authorized) && advisorId && advisorId !== authorized.actor.id.toLowerCase()) {
      throw new BonusApiError(403, 'FORBIDDEN', 'Solo puedes consultar tu propia liquidación.');
    }
    const source = request.nextUrl.searchParams.get('source') ?? 'auto';
    const history = request.nextUrl.searchParams.get('include_history') ?? 'false';
    if (!['auto', 'snapshot'].includes(source) || !['true', 'false'].includes(history)) {
      throw new BonusApiError(400, 'INVALID_REQUEST', 'Los parámetros de consulta no son válidos.');
    }
    await assertSchema(authorized);
    const periods = await loadPeriods(authorized, range.periodDate, advisorId, history === 'true');
    const periodByAdvisor = new Map(periods.map((row) => [row.asesor_id, row]));
    const results = new Map<string, LiquidationResult>();
    for (const row of periods) {
      if (row.snapshot) results.set(row.asesor_id, snapshotResult(row));
      else if (row.estado !== 'provisional') {
        throw new BonusApiError(422, 'SNAPSHOT_INVALID', 'Una liquidación cerrada no conserva su snapshot.');
      }
    }

    if (source !== 'snapshot' && !(advisorId && periodByAdvisor.get(advisorId)?.estado !== 'provisional' && results.has(advisorId))) {
      const advisors = await getTargetAdvisors(authorized, advisorId);
      const liveAdvisorIds = advisors.map((advisor) => advisor.id)
        .filter((id) => !periodByAdvisor.has(id) || periodByAdvisor.get(id)?.estado === 'provisional');
      const live = liveAdvisorIds.length
        ? await calculatePlatformBonuses({ admin: authorized.admin, period: range.period, advisorIds: liveAdvisorIds })
        : [];
      const allowedIds = new Set(liveAdvisorIds);
      for (const rawCalculation of live) {
        if (!allowedIds.has(rawCalculation.advisor.id)) continue;
        const calculation = normalizeCalculation(rawCalculation);
        const row = periodByAdvisor.get(calculation.advisor.id);
        results.set(calculation.advisor.id, {
          ...calculation,
          status: 'provisional',
          source: 'live',
          calculationHash: getPlatformBonusCalculationHash(calculation),
          periodId: row?.id ?? null,
          version: row?.version ?? 0,
          updatedAt: row?.updated_at ?? null,
          closedAt: null,
          paidAt: null,
          generatedAt: new Date().toISOString(),
          ...(row?.historial ? { history: row.historial } : {}),
        });
      }
    }
    if (results.size === 0) {
      throw new BonusApiError(404, source === 'snapshot' ? 'SNAPSHOT_NOT_FOUND' : 'NOT_FOUND',
        source === 'snapshot' ? 'No existe un snapshot para la consulta solicitada.' : 'No se encontraron liquidaciones disponibles.');
    }
    return json({
      period: range.period,
      percentage: PLATFORM_BONUS_PERCENT,
      canManage: hasGlobalAccess(authorized),
      results: [...results.values()].sort((a, b) => a.advisor.name.localeCompare(b.advisor.name, 'es')),
    });
  } catch (error) {
    return failure(error, 'GET');
  }
}

type LiquidationResult = AuditableCalculation & {
  status: CommissionPeriodStatus;
  source: 'snapshot' | 'live';
  periodId: string | null;
  version: number;
  calculationHash: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  paidAt: string | null;
  generatedAt: string | null;
  history?: unknown[];
};

export async function POST(request: NextRequest) {
  try {
    const authorized = await authorizeApiRoles(['direccion', 'super_admin']);
    if (authorized instanceof NextResponse) return authorizationFailure(authorized);
    if (!hasGlobalAccess(authorized)) throw new BonusApiError(403, 'FORBIDDEN', 'No tienes permisos para gestionar liquidaciones.');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new BonusApiError(400, 'INVALID_JSON', 'El cuerpo de la solicitud debe ser JSON válido.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BonusApiError(400, 'INVALID_REQUEST', 'La solicitud debe ser un objeto JSON.');
    }
    const input = body as Record<string, unknown>;
    const advisorId = validateAdvisorId(input.asesor_id);
    const range = validatePeriod(input.periodo);
    const action = input.action;
    if (typeof action !== 'string' || !['close', 'reopen', 'mark_paid'].includes(action)) {
      throw new BonusApiError(400, 'INVALID_ACTION', 'La acción de liquidación no es válida.');
    }
    if (input.expected_version === undefined) {
      throw new BonusApiError(428, 'PRECONDITION_REQUIRED', 'Envía expected_version con la versión mostrada al confirmar.');
    }
    const expectedVersion = input.expected_version;
    if (typeof expectedVersion !== 'number' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647) {
      throw new BonusApiError(400, 'INVALID_VERSION', 'La versión esperada no es válida.');
    }
    if (range.period === currentPeriod()) {
      throw new BonusApiError(409, 'PERIOD_NOT_FINISHED', 'El periodo solo puede gestionarse después de terminar el mes.');
    }
    await assertSchema(authorized);
    if (action !== 'close') {
      const { data, error } = await authorized.admin.rpc('transicionar_periodo_bono_plataforma', {
        p_asesor_id: advisorId,
        p_periodo: range.periodDate,
        p_action: action,
        p_actor_id: authorized.actor.id,
        p_expected_version: expectedVersion,
      });
      if (error) throw error;
      return json(data);
    }

    if (typeof input.expected_calculation_hash !== 'string' || !/^[a-f0-9]{64}$/.test(input.expected_calculation_hash)) {
      throw new BonusApiError(428, 'PRECONDITION_REQUIRED', 'Actualiza el cálculo provisional antes de confirmar el cierre.');
    }
    const [existing] = await loadPeriods(authorized, range.periodDate, advisorId);
    if ((existing?.version ?? 0) !== expectedVersion) {
      throw new BonusApiError(409, 'VERSION_CONFLICT', 'La liquidación cambió. Actualiza la vista y vuelve a confirmar.');
    }
    if (existing && existing.estado !== 'provisional') {
      throw new BonusApiError(409, 'INVALID_STATE', 'La liquidación ya está cerrada o pagada.');
    }
    const [advisor] = await getTargetAdvisors(authorized, advisorId, true);
    if (!advisor) throw new BonusApiError(404, 'NOT_FOUND', 'Asesora no encontrada.');
    const calculationOptions = {
      admin: authorized.admin,
      period: range.period,
      advisorIds: [advisorId],
      includeInactiveAdvisors: true,
    };
    const calculations = await calculatePlatformBonuses(calculationOptions);
    const rawCalculation = calculations.find((item) => item.advisor.id === advisorId);
    if (!rawCalculation) {
      throw new BonusApiError(422, 'CALCULATION_UNAVAILABLE', 'No hay un cálculo íntegro disponible para cerrar esta asesora.');
    }
    const calculation = normalizeCalculation(rawCalculation);
    if (calculation.period !== range.period || calculation.periodDate !== range.periodDate) {
      throw new BonusApiError(422, 'SNAPSHOT_INVALID', 'El cálculo no corresponde al periodo solicitado.');
    }
    if (calculation.blockingIssues.length > 0) {
      throw new BonusApiError(422, 'BLOCKING_ISSUES', 'Resuelve las incidencias bloqueantes antes de cerrar el periodo.', calculation.blockingIssues);
    }
    if (getPlatformBonusCalculationHash(calculation) !== input.expected_calculation_hash) {
      throw new BonusApiError(409, 'CALCULATION_CHANGED', 'La facturación o elegibilidad cambió desde la revisión. Actualiza y confirma los nuevos valores.');
    }
    const { data, error } = await authorized.admin.rpc('cerrar_periodo_bono_plataforma', {
      p_asesor_id: advisorId,
      p_periodo: range.periodDate,
      p_porcentaje: calculation.percentage,
      p_resumen: {
        active_clients: calculation.totals.activeClients,
        invoice_count: calculation.totals.invoiceCount,
        credit_note_count: calculation.totals.creditNoteCount,
        invoiced_base: calculation.totals.invoicedBase,
        credit_notes: calculation.totals.creditNotes,
        net_base: calculation.totals.netBase,
        bonus: calculation.totals.bonus,
      },
      p_clientes: calculation.clients.map((client) => ({
        empresa_id: client.id,
        empresa_nombre: client.name,
        bono_vigente_desde: client.bonusStartDate,
        facturas_count: client.invoiceCount,
        notas_credito_count: client.creditNoteCount,
        base_facturada: client.invoicedBase,
        notas_credito: client.creditNotes,
        base_neta: client.netBase,
        bono: client.bonus,
      })),
      p_detalles: calculation.details.map((detail) => ({
        empresa_id: detail.companyId,
        empresa_nombre: detail.companyName,
        odoo_invoice_id: detail.invoiceId,
        odoo_invoice_name: detail.invoiceName,
        invoice_date: detail.invoiceDate,
        tipo_documento: detail.documentType,
        currency: detail.currency,
        base_sin_iva: detail.netBase,
        bono: detail.bonus,
        pedido_ids: detail.orderIds,
        odoo_sale_order_ids: detail.saleOrderIds,
        odoo_invoice_line_ids: detail.invoiceLineIds,
      })),
      p_actor_id: authorized.actor.id,
      p_expected_version: expectedVersion,
      p_blocking_issues: calculation.blockingIssues,
      p_warnings: calculation.warnings,
    });
    if (error) throw error;
    return json(data);
  } catch (error) {
    return failure(error, 'POST');
  }
}
