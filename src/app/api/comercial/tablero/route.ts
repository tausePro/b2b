import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { userHasAnyRole } from '@/lib/auth/roles';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { authenticate, searchRead } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { ALERT_ACTIONS, isMonth } from '@/lib/comercial/tablero';
import {
  clearCommercialBoardCache, commercialTrackingEnabled, loadCommercialAdvisors, loadCommercialBoards,
} from '@/lib/comercial/tablero.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRATION = 'Falta la migración 057 (tablero comercial). Ejecútala en Supabase para guardar metas, umbrales y gestión de alertas.';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

function fail(error: unknown, scope: string) {
  if (error instanceof FinancialDataError) return json({ error: error.message }, error.status);
  console.error(`[comercial/tablero:${scope}]`, error);
  return json({ error: 'No se pudo completar la operación del tablero comercial. Intenta de nuevo.' }, 502);
}

// Tablero comercial: la asesora ve solo el suyo; Dirección y Super Admin ven el equipo o una asesora (?asesora=<id>).
export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['asesor', 'direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  const canViewTeam = userHasAnyRole(auth.actor, ['direccion', 'super_admin']);
  const requested = request.nextUrl.searchParams.get('asesora');
  if (requested !== null && !UUID.test(requested)) return json({ error: 'La asesora solicitada no es válida.' }, 400);
  if (!canViewTeam && requested && requested.toLowerCase() !== auth.actor.id) return json({ error: 'Solo puedes consultar tu propio tablero.' }, 403);
  try {
    if (!canViewTeam || requested) {
      const [board] = await loadCommercialBoards(auth.admin, [canViewTeam ? requested!.toLowerCase() : auth.actor.id]);
      if (!board) return json({ error: 'La asesora no tiene un vendedor de Odoo vinculado. Solicita a Dirección revisar el usuario.' }, 404);
      return json({ board, canViewTeam });
    }
    const boards = await loadCommercialBoards(auth.admin);
    return json({ team: boards.map((board) => ({ ...board, alerts: board.alerts.slice(0, 5), frequentInactive: board.frequentInactive.slice(0, 3) })), canViewTeam });
  } catch (error) {
    return fail(error, 'get');
  }
}

// Gestión de una alerta (contactado, hizo pedido, pendiente, no requiere, oportunidad, otro).
export async function POST(request: NextRequest) {
  const auth = await authorizeApiRoles(['asesor', 'direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null) as { partnerId?: unknown; estado?: unknown; nota?: unknown; valor?: unknown } | null;
  const partnerId = Number(body?.partnerId);
  const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim() : null;
  const valor = body?.valor === null || body?.valor === undefined || body?.valor === '' ? null : Number(body.valor);
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) return json({ error: 'Cliente inválido.' }, 400);
  if (typeof body?.estado !== 'string' || !ALERT_ACTIONS.some((action) => action.value === body.estado)) return json({ error: 'Selecciona qué pasó con el cliente.' }, 400);
  if (nota && nota.length > 2000) return json({ error: 'La nota admite hasta 2.000 caracteres.' }, 400);
  if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) return json({ error: 'El valor de la oportunidad debe ser mayor que cero.' }, 400);
  if ((body.estado === 'otro' || body.estado === 'no_requiere') && !nota) return json({ error: 'Cuéntanos el motivo en la nota.' }, 400);
  try {
    if (!await commercialTrackingEnabled(auth.admin)) return json({ error: MIGRATION }, 409);
    const config = await getServerOdooConfig();
    if (!config) throw new FinancialDataError('No está configurada la conexión Odoo.', 503);
    const [partner] = await searchRead('res.partner', [['id', '=', partnerId]], ['id', 'user_id'], { session: await authenticate(config), limit: 1 });
    const ownerOdooId = Array.isArray(partner?.user_id) ? Number(partner.user_id[0]) : null;
    const advisors = await loadCommercialAdvisors(auth.admin);
    const owner = advisors.find((advisor) => advisor.odooUserId === ownerOdooId) ?? null;
    if (!partner) return json({ error: 'El cliente no existe en Odoo.' }, 404);
    if (!userHasAnyRole(auth.actor, ['direccion', 'super_admin']) && owner?.id !== auth.actor.id) return json({ error: 'Solo puedes gestionar clientes asignados a ti en Odoo.' }, 403);
    const row = (await loadCommercialBoards(auth.admin)).flatMap((board) => board.alerts).find((alert) => alert.partnerId === partnerId);
    const { error } = await auth.admin.from('alertas_clientes_gestion').insert({
      odoo_partner_id: partnerId, asesor_id: owner?.id ?? null, estado: body.estado, nota, valor_oportunidad: body.estado === 'oportunidad' ? valor : null,
      nivel_alerta: row?.alert?.level === 'prioritaria' || row?.alert?.level === 'seguimiento' ? row.alert.level : null, ultima_compra: row?.lastPurchase ?? null,
      usuario_id: auth.actor.id,
    });
    if (error) throw error;
    clearCommercialBoardCache();
    return json({ ok: true });
  } catch (error) {
    return fail(error, 'gestion');
  }
}

// Dirección: meta mensual por asesora o umbral de alerta por cliente (valor null elimina).
export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRoles(['direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    if (!await commercialTrackingEnabled(auth.admin)) return json({ error: MIGRATION }, 409);
    if (body?.tipo === 'meta') {
      const advisorId = String(body.asesorId ?? '').toLowerCase();
      const month = String(body.mes ?? '');
      const value = body.valor === null ? null : Number(body.valor);
      if (!UUID.test(advisorId) || !(await loadCommercialAdvisors(auth.admin)).some((advisor) => advisor.id === advisorId)) return json({ error: 'Asesora inválida.' }, 400);
      if (!isMonth(month)) return json({ error: 'Mes inválido.' }, 400);
      if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 1e12)) return json({ error: 'La meta debe ser un valor mayor que cero.' }, 400);
      const query = value === null
        ? auth.admin.from('metas_comerciales').delete().eq('asesor_id', advisorId).eq('mes', `${month}-01`)
        : auth.admin.from('metas_comerciales').upsert({ asesor_id: advisorId, mes: `${month}-01`, valor: value, actualizado_por: auth.actor.id, updated_at: new Date().toISOString() }, { onConflict: 'asesor_id,mes' });
      const { error } = await query;
      if (error) throw error;
    } else if (body?.tipo === 'umbral') {
      const partnerId = Number(body.partnerId);
      if (!Number.isSafeInteger(partnerId) || partnerId <= 0) return json({ error: 'Cliente inválido.' }, 400);
      if (body.diasSeguimiento === null) {
        const { error } = await auth.admin.from('alertas_clientes_umbral').delete().eq('odoo_partner_id', partnerId);
        if (error) throw error;
      } else {
        const followUp = Number(body.diasSeguimiento);
        const priority = Number(body.diasPrioritaria);
        if (!Number.isInteger(followUp) || !Number.isInteger(priority) || followUp < 1 || followUp > 730 || priority <= followUp || priority > 1095) {
          return json({ error: 'Los días de prioritaria deben ser mayores que los de seguimiento (entre 1 y 1.095).' }, 400);
        }
        const { error } = await auth.admin.from('alertas_clientes_umbral').upsert({ odoo_partner_id: partnerId, dias_seguimiento: followUp, dias_prioritaria: priority, actualizado_por: auth.actor.id, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    } else {
      return json({ error: 'Operación no válida.' }, 400);
    }
    clearCommercialBoardCache();
    return json({ ok: true });
  } catch (error) {
    return fail(error, 'ajustes');
  }
}
