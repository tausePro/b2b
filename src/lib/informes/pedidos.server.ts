import 'server-only';

import type { AuthorizedApiContext } from '@/lib/auth/apiRouteGuards';
import { getClientCompanyAccess } from '@/lib/auth/companyMemberships.server';
import { userHasAnyRole } from '@/lib/auth/roles';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import { financialComparison } from '@/lib/gerencia/finanzas';
import type { EstadoPedido, TipoPedidoItem } from '@/types';
import {
  buildOrderMetricsReport,
  defaultOrderReportRange,
  ORDER_STATUSES,
  toBogotaDateString,
  validateOrderReportRange,
  type OrderItemRecord,
  type OrderMetricsReport,
  type OrderRecord,
  type OrderReportEmpresaOption,
  type OrderReportFilters,
  type OrderReportSedeOption,
  type SiteBudgetRecord,
} from './pedidos';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OrderReportError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export interface OrderReportQueryInput {
  empresaId?: string | null;
  sedeId?: string | null;
  estado?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

interface ResolvedOrderReportScope {
  empresaIds: string[];
  selectedEmpresaId: string | null;
  allowedSedeIds: Set<string> | null;
  showPrices: boolean;
}

export async function resolveOrderReportScope(
  context: AuthorizedApiContext,
  requestedEmpresaId: string | null
): Promise<ResolvedOrderReportScope> {
  if (!userHasAnyRole(context.actor, ['comprador', 'aprobador', 'asesor', 'direccion', 'super_admin'])) {
    throw new OrderReportError('No tienes permisos para consultar informes de pedidos.', 403);
  }

  const normalizedEmpresaId =
    !requestedEmpresaId || requestedEmpresaId === 'all' ? null : requestedEmpresaId.trim().toLowerCase();

  if (normalizedEmpresaId !== null && !UUID_REGEX.test(normalizedEmpresaId)) {
    throw new OrderReportError('El identificador de empresa no es válido.', 400);
  }

  const isGlobalInternal = userHasAnyRole(context.actor, ['super_admin', 'direccion']);
  const isAdvisorInternal = !isGlobalInternal && userHasAnyRole(context.actor, ['asesor']);

  if (isGlobalInternal) {
    if (normalizedEmpresaId) {
      const { data: emp, error } = await context.admin
        .from('empresas')
        .select('id')
        .eq('id', normalizedEmpresaId)
        .maybeSingle();
      if (error) throw new OrderReportError('No se pudo verificar la empresa solicitada.', 500);
      if (!emp) throw new OrderReportError('Empresa no encontrada.', 404);
      return {
        empresaIds: [String(emp.id)],
        selectedEmpresaId: String(emp.id),
        allowedSedeIds: null,
        showPrices: true,
      };
    }

    const { data, error } = await context.admin
      .from('empresas')
      .select('id')
      .eq('activa', true)
      .order('nombre');
    if (error) throw new OrderReportError('No se pudieron consultar las empresas.', 500);
    return {
      empresaIds: (data ?? []).map((row) => String(row.id)),
      selectedEmpresaId: null,
      allowedSedeIds: null,
      showPrices: true,
    };
  }

  if (isAdvisorInternal) {
    const { data, error } = await context.admin
      .from('asesor_empresas')
      .select('empresa_id')
      .eq('usuario_id', context.actor.id)
      .eq('activo', true);
    if (error) throw new OrderReportError('No se pudo verificar tu cartera de clientes.', 500);

    const assignedIds = Array.from(new Set((data ?? []).map((row) => String(row.empresa_id))));
    if (normalizedEmpresaId) {
      if (!assignedIds.includes(normalizedEmpresaId)) {
        throw new OrderReportError('Este cliente no está asignado a tu cartera comercial.', 403);
      }
      return {
        empresaIds: [normalizedEmpresaId],
        selectedEmpresaId: normalizedEmpresaId,
        allowedSedeIds: null,
        showPrices: true,
      };
    }

    return {
      empresaIds: assignedIds,
      selectedEmpresaId: assignedIds.length === 1 ? assignedIds[0] : null,
      allowedSedeIds: null,
      showPrices: true,
    };
  }

  // Actor cliente (comprador / aprobador)
  const targetEmpresaId = normalizedEmpresaId ?? context.actor.empresa_id?.toLowerCase() ?? null;
  if (!targetEmpresaId || !UUID_REGEX.test(targetEmpresaId)) {
    throw new OrderReportError('No tienes una empresa activa asignada para consultar informes.', 403);
  }

  const companyAccess = await getClientCompanyAccess(context.admin, context.actor.id, targetEmpresaId);
  if (!companyAccess) {
    throw new OrderReportError('No tienes acceso activo a la empresa solicitada.', 403);
  }

  const { data: configData } = await context.admin
    .from('empresa_configs')
    .select('configuracion_extra')
    .eq('empresa_id', targetEmpresaId)
    .maybeSingle();

  const extra =
    configData?.configuracion_extra && typeof configData.configuracion_extra === 'object'
      ? (configData.configuracion_extra as Record<string, unknown>)
      : {};

  let showPrices = companyAccess.role === 'aprobador';
  if (companyAccess.role === 'comprador' && typeof extra.mostrar_precios_comprador === 'boolean') {
    showPrices = extra.mostrar_precios_comprador;
  } else if (companyAccess.role === 'aprobador' && typeof extra.mostrar_precios_aprobador === 'boolean') {
    showPrices = extra.mostrar_precios_aprobador;
  }

  return {
    empresaIds: [targetEmpresaId],
    selectedEmpresaId: targetEmpresaId,
    allowedSedeIds: companyAccess.siteIds.length > 0 ? new Set(companyAccess.siteIds) : null,
    showPrices,
  };
}

export async function getOrderMetricsReport(
  context: AuthorizedApiContext,
  query: OrderReportQueryInput
): Promise<OrderMetricsReport> {
  const today = getBogotaCalendarDate();
  const defaultRange = defaultOrderReportRange(today);
  const from = query.desde?.trim() || defaultRange.from;
  const to = query.hasta?.trim() || defaultRange.to;

  let range;
  try {
    range = validateOrderReportRange(from, to, today);
  } catch (error) {
    throw new OrderReportError(error instanceof Error ? error.message : 'Rango de fechas inválido.', 400);
  }

  const rawSedeId = !query.sedeId || query.sedeId === 'all' ? null : query.sedeId.trim().toLowerCase();
  if (rawSedeId !== null && rawSedeId !== 'sin_sede' && !UUID_REGEX.test(rawSedeId)) {
    throw new OrderReportError('La sede seleccionada no es válida.', 400);
  }

  const rawEstado = !query.estado || query.estado === 'todos' ? 'todos' : query.estado.trim();
  if (rawEstado !== 'todos' && !ORDER_STATUSES.includes(rawEstado as EstadoPedido)) {
    throw new OrderReportError('El estado de pedido seleccionado no es válido.', 400);
  }

  const scope = await resolveOrderReportScope(context, query.empresaId ?? null);
  if (rawSedeId && rawSedeId !== 'sin_sede' && scope.allowedSedeIds && !scope.allowedSedeIds.has(rawSedeId)) {
    throw new OrderReportError('No tienes acceso a la sede solicitada.', 403);
  }

  const filters: OrderReportFilters = {
    empresaId: scope.selectedEmpresaId,
    sedeId: rawSedeId,
    estado: rawEstado as EstadoPedido | 'todos',
  };

  if (scope.empresaIds.length === 0) {
    return buildOrderMetricsReport({
      orders: [],
      items: [],
      siteBudgets: [],
      empresas: [],
      sedes: [],
      range,
      filters,
      showPrices: scope.showPrices,
    });
  }

  const previousRange = financialComparison(range).range;
  const minDateIso = `${previousRange.from}T00:00:00-05:00`;
  const maxDateIso = `${range.to}T23:59:59.999-05:00`;

  const [budgetYearStr, budgetMonthStr] = range.to.slice(0, 7).split('-');
  const budgetYear = Number(budgetYearStr);
  const budgetMonth = Number(budgetMonthStr);

  const [empresasRes, sedesRes, pedidosRes] = await Promise.all([
    context.admin
      .from('empresas')
      .select('id, nombre, nit, presupuesto_global_mensual')
      .in('id', scope.empresaIds)
      .order('nombre'),
    context.admin
      .from('sedes')
      .select('id, empresa_id, nombre_sede, ciudad, presupuesto_asignado, presupuesto_alerta_threshold, activa')
      .in('empresa_id', scope.empresaIds)
      .order('nombre_sede'),
    context.admin
      .from('pedidos')
      .select(
        `
        id,
        numero,
        empresa_id,
        sede_id,
        usuario_creador_id,
        estado,
        odoo_sale_order_id,
        valor_total_cop,
        total_items,
        excede_presupuesto,
        fecha_creacion,
        fecha_aprobacion,
        fecha_validacion,
        empresa:empresas(nombre),
        sede:sedes(nombre_sede, ciudad),
        creador:usuarios!pedidos_usuario_creador_id_fkey(nombre, apellido, email)
      `
      )
      .in('empresa_id', scope.empresaIds)
      .gte('fecha_creacion', minDateIso)
      .lte('fecha_creacion', maxDateIso)
      .order('fecha_creacion', { ascending: false })
      .limit(5000),
  ]);

  if (empresasRes.error) {
    throw new OrderReportError('No se pudo cargar la información de empresas.', 500);
  }
  if (sedesRes.error) {
    throw new OrderReportError('No se pudo cargar la información de sedes.', 500);
  }
  if (pedidosRes.error) {
    throw new OrderReportError('No se pudieron consultar los pedidos del período.', 500);
  }

  const empresas: OrderReportEmpresaOption[] = (empresasRes.data ?? []).map((emp) => ({
    id: String(emp.id),
    nombre: String(emp.nombre),
    nit: emp.nit ? String(emp.nit) : null,
    presupuestoGlobalMensual:
      emp.presupuesto_global_mensual !== null && emp.presupuesto_global_mensual !== undefined
        ? Number(emp.presupuesto_global_mensual)
        : null,
  }));
  const empresaNameById = new Map(empresas.map((emp) => [emp.id, emp.nombre]));

  const visibleSedeRows = (sedesRes.data ?? []).filter(
    (sede) => !scope.allowedSedeIds || scope.allowedSedeIds.has(String(sede.id))
  );

  const sedes: OrderReportSedeOption[] = visibleSedeRows.map((sede) => ({
    id: String(sede.id),
    nombre: String(sede.nombre_sede),
    ciudad: sede.ciudad ? String(sede.ciudad) : null,
    empresaId: String(sede.empresa_id),
  }));

  const sedeIdsForBudget = visibleSedeRows.map((sede) => String(sede.id));
  const presupuestosBySedeId = new Map<
    string,
    { montoInicial: number; montoConsumido: number; montoDisponible: number; estado: string }
  >();

  if (sedeIdsForBudget.length > 0) {
    const { data: presupuestosData, error: presupuestosError } = await context.admin
      .from('presupuestos_mensuales')
      .select('sede_id, monto_inicial, monto_consumido, monto_disponible, estado')
      .in('sede_id', sedeIdsForBudget)
      .eq('anio', budgetYear)
      .eq('mes', budgetMonth);

    if (presupuestosError) {
      throw new OrderReportError('No se pudieron consultar los presupuestos mensuales.', 500);
    }

    for (const row of presupuestosData ?? []) {
      presupuestosBySedeId.set(String(row.sede_id), {
        montoInicial: Number(row.monto_inicial ?? 0),
        montoConsumido: Number(row.monto_consumido ?? 0),
        montoDisponible: Number(row.monto_disponible ?? 0),
        estado: String(row.estado ?? 'activo'),
      });
    }
  }

  const siteBudgets: SiteBudgetRecord[] = visibleSedeRows.map((sede) => {
    const sedeId = String(sede.id);
    const mensual = presupuestosBySedeId.get(sedeId);
    return {
      sedeId,
      sedeNombre: String(sede.nombre_sede),
      ciudad: sede.ciudad ? String(sede.ciudad) : null,
      empresaId: String(sede.empresa_id),
      presupuestoAsignadoSede: Number(sede.presupuesto_asignado ?? 0),
      alertaThreshold: Number(sede.presupuesto_alerta_threshold ?? 90),
      montoInicialMes: mensual ? mensual.montoInicial : null,
      montoConsumidoMes: mensual ? mensual.montoConsumido : null,
      montoDisponibleMes: mensual ? mensual.montoDisponible : null,
      estadoPresupuestoMes: mensual ? mensual.estado : null,
    };
  });

  const orders: OrderRecord[] = [];
  for (const raw of (pedidosRes.data ?? []) as Array<Record<string, unknown>>) {
    const sedeId = raw.sede_id ? String(raw.sede_id) : null;
    if (scope.allowedSedeIds && sedeId !== null && !scope.allowedSedeIds.has(sedeId)) {
      continue;
    }

    const empresaRel = Array.isArray(raw.empresa) ? raw.empresa[0] : raw.empresa;
    const sedeRel = Array.isArray(raw.sede) ? raw.sede[0] : raw.sede;
    const creadorRel = Array.isArray(raw.creador) ? raw.creador[0] : raw.creador;

    const empresaId = String(raw.empresa_id);
    const empresaNombre =
      (empresaRel && typeof (empresaRel as { nombre?: unknown }).nombre === 'string'
        ? String((empresaRel as { nombre: string }).nombre)
        : empresaNameById.get(empresaId)) ?? 'Empresa';

    const sedeNombre =
      sedeRel && typeof (sedeRel as { nombre_sede?: unknown }).nombre_sede === 'string'
        ? String((sedeRel as { nombre_sede: string }).nombre_sede)
        : 'Sin sede asignada';
    const sedeCiudad =
      sedeRel && typeof (sedeRel as { ciudad?: unknown }).ciudad === 'string'
        ? String((sedeRel as { ciudad: string }).ciudad)
        : null;

    const creadorNombre = creadorRel
      ? [
          typeof (creadorRel as { nombre?: unknown }).nombre === 'string'
            ? (creadorRel as { nombre: string }).nombre
            : '',
          typeof (creadorRel as { apellido?: unknown }).apellido === 'string'
            ? (creadorRel as { apellido: string }).apellido
            : '',
        ]
          .filter(Boolean)
          .join(' ')
          .trim() || 'Usuario'
      : 'Usuario';

    const creadorEmail =
      creadorRel && typeof (creadorRel as { email?: unknown }).email === 'string'
        ? String((creadorRel as { email: string }).email)
        : null;

    const fechaCreacion = String(raw.fecha_creacion);
    const fechaCreacionDate = toBogotaDateString(fechaCreacion);

    orders.push({
      id: String(raw.id),
      numero: String(raw.numero),
      empresaId,
      empresaNombre,
      sedeId,
      sedeNombre,
      sedeCiudad,
      creadorId: String(raw.usuario_creador_id),
      creadorNombre,
      creadorEmail,
      estado: String(raw.estado) as EstadoPedido,
      odooSaleOrderId:
        raw.odoo_sale_order_id !== null && raw.odoo_sale_order_id !== undefined
          ? Number(raw.odoo_sale_order_id)
          : null,
      valorTotalCop: Number(raw.valor_total_cop ?? 0),
      totalItems: Number(raw.total_items ?? 0),
      excedePresupuesto: Boolean(raw.excede_presupuesto),
      fechaCreacion,
      fechaCreacionDate,
      fechaAprobacion: raw.fecha_aprobacion ? String(raw.fecha_aprobacion) : null,
      fechaValidacion: raw.fecha_validacion ? String(raw.fecha_validacion) : null,
    });
  }

  const currentOrderIds = orders
    .filter((order) => order.fechaCreacionDate >= range.from && order.fechaCreacionDate <= range.to)
    .map((order) => order.id);

  const items: OrderItemRecord[] = [];
  for (let i = 0; i < currentOrderIds.length; i += 400) {
    const batchIds = currentOrderIds.slice(i, i + 400);
    const { data: itemsData, error: itemsError } = await context.admin
      .from('pedido_items')
      .select(
        'id, pedido_id, tipo_item, odoo_product_id, nombre_producto, unidad, referencia_cliente, cantidad, precio_unitario_cop, subtotal_cop'
      )
      .in('pedido_id', batchIds);

    if (itemsError) {
      throw new OrderReportError('No se pudo cargar el detalle de productos solicitados.', 500);
    }

    for (const row of itemsData ?? []) {
      const cantidad = Number(row.cantidad ?? 0);
      const precioUnitarioCop = Number(row.precio_unitario_cop ?? 0);
      const subtotalCop =
        row.subtotal_cop !== null && row.subtotal_cop !== undefined
          ? Number(row.subtotal_cop)
          : cantidad * precioUnitarioCop;

      items.push({
        id: String(row.id),
        pedidoId: String(row.pedido_id),
        tipoItem: (row.tipo_item === 'especial' ? 'especial' : 'catalogo') as TipoPedidoItem,
        odooProductId:
          row.odoo_product_id !== null && row.odoo_product_id !== undefined
            ? Number(row.odoo_product_id)
            : null,
        nombreProducto: String(row.nombre_producto ?? 'Producto'),
        unidad: row.unidad ? String(row.unidad) : 'Und',
        referenciaCliente: row.referencia_cliente ? String(row.referencia_cliente) : null,
        cantidad,
        precioUnitarioCop,
        subtotalCop,
      });
    }
  }

  return buildOrderMetricsReport({
    orders,
    items,
    siteBudgets,
    empresas,
    sedes,
    range,
    filters,
    showPrices: scope.showPrices,
  });
}
