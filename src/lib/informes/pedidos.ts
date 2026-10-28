import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import { financialComparison } from '@/lib/gerencia/finanzas';
import type { EstadoPedido, TipoPedidoItem } from '@/types';

export const ORDER_REPORT_MAX_DAYS = 366;

export const ORDER_STATUSES: readonly EstadoPedido[] = [
  'borrador',
  'en_aprobacion',
  'aprobado',
  'en_validacion_imprima',
  'procesado_odoo',
  'rechazado',
];

export const ORDER_STATUS_LABELS: Record<EstadoPedido, string> = {
  borrador: 'Borrador',
  en_aprobacion: 'En aprobación',
  aprobado: 'Aprobado',
  en_validacion_imprima: 'En validación Imprima',
  procesado_odoo: 'Procesado en Odoo',
  rechazado: 'Rechazado',
};

export interface OrderReportRange {
  from: string;
  to: string;
}

export interface OrderReportFilters {
  empresaId: string | null;
  sedeId: string | null;
  estado: EstadoPedido | 'todos';
}

export interface OrderRecord {
  id: string;
  numero: string;
  empresaId: string;
  empresaNombre: string;
  sedeId: string | null;
  sedeNombre: string;
  sedeCiudad: string | null;
  creadorId: string;
  creadorNombre: string;
  creadorEmail: string | null;
  estado: EstadoPedido;
  odooSaleOrderId: number | null;
  valorTotalCop: number;
  totalItems: number;
  excedePresupuesto: boolean;
  fechaCreacion: string;
  fechaCreacionDate: string;
  fechaAprobacion: string | null;
  fechaValidacion: string | null;
}

export interface OrderItemRecord {
  id: string;
  pedidoId: string;
  tipoItem: TipoPedidoItem;
  odooProductId: number | null;
  nombreProducto: string;
  unidad: string;
  referenciaCliente: string | null;
  cantidad: number;
  precioUnitarioCop: number;
  subtotalCop: number;
}

export interface SiteBudgetRecord {
  sedeId: string;
  sedeNombre: string;
  ciudad: string | null;
  empresaId: string;
  presupuestoAsignadoSede: number;
  alertaThreshold: number;
  montoInicialMes: number | null;
  montoConsumidoMes: number | null;
  montoDisponibleMes: number | null;
  estadoPresupuestoMes: string | null;
}

export interface OrderReportEmpresaOption {
  id: string;
  nombre: string;
  nit: string | null;
  presupuestoGlobalMensual: number | null;
}

export interface OrderReportSedeOption {
  id: string;
  nombre: string;
  ciudad: string | null;
  empresaId: string;
}

export interface OrderReportKpis {
  totalOrders: number;
  previousTotalOrders: number;
  ordersChangePercent: number | null;
  activeOrders: number;
  processedOrders: number;
  approvedOrProcessedOrders: number;
  rejectedOrders: number;
  draftOrders: number;
  approvalRatePercent: number | null;
  odooSyncRatePercent: number | null;
  exceededBudgetOrders: number;
  totalUnits: number;
  totalLineItems: number;
  avgUnitsPerOrder: number | null;
  totalValueCop: number | null;
  previousTotalValueCop: number | null;
  valueChangePercent: number | null;
  approvedValueCop: number | null;
  pendingApprovalValueCop: number | null;
  avgTicketCop: number | null;
  avgApprovalHours: number | null;
  avgValidationHours: number | null;
  avgEndToEndHours: number | null;
}

export interface OrderStatusBreakdownRow {
  estado: EstadoPedido;
  label: string;
  count: number;
  sharePercent: number;
  units: number;
  valueCop: number | null;
}

export interface OrderSiteBreakdownRow {
  sedeId: string | null;
  sedeNombre: string;
  ciudad: string | null;
  orderCount: number;
  approvedOrderCount: number;
  pendingOrderCount: number;
  rejectedOrderCount: number;
  exceededCount: number;
  units: number;
  periodValueCop: number | null;
  budgetAssignedCop: number | null;
  budgetConsumedMonthCop: number | null;
  budgetAvailableMonthCop: number | null;
  budgetExecutionPercent: number | null;
  alertaThreshold: number;
}

export interface OrderMonthlyTrendRow {
  month: string;
  label: string;
  orderCount: number;
  approvedCount: number;
  processedCount: number;
  rejectedCount: number;
  units: number;
  valueCop: number | null;
  avgTicketCop: number | null;
  avgApprovalHours: number | null;
}

export interface OrderTopProductRow {
  key: string;
  odooProductId: number | null;
  nombreProducto: string;
  tipoItem: TipoPedidoItem;
  unidad: string;
  orderCount: number;
  totalQuantity: number;
  avgUnitPriceCop: number | null;
  subtotalCop: number | null;
  shareUnitsPercent: number;
}

export interface OrderRequesterBreakdownRow {
  usuarioId: string;
  nombre: string;
  email: string | null;
  orderCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  units: number;
  valueCop: number | null;
  avgTicketCop: number | null;
}

export interface OrderDetailMetricRow {
  id: string;
  numero: string;
  fechaCreacion: string;
  fechaCreacionDate: string;
  empresaNombre: string;
  sedeId: string | null;
  sedeNombre: string;
  creadorNombre: string;
  estado: EstadoPedido;
  estadoLabel: string;
  totalItems: number;
  totalUnits: number;
  valorTotalCop: number | null;
  excedePresupuesto: boolean;
  odooSaleOrderId: number | null;
  approvalHours: number | null;
  validationHours: number | null;
}

export interface OrderMetricsReport {
  generatedAt: string;
  range: OrderReportRange;
  previousRange: OrderReportRange;
  budgetPeriod: { year: number; month: number; period: string; label: string };
  showPrices: boolean;
  filters: OrderReportFilters;
  empresas: OrderReportEmpresaOption[];
  sedes: OrderReportSedeOption[];
  kpis: OrderReportKpis;
  byStatus: OrderStatusBreakdownRow[];
  bySite: OrderSiteBreakdownRow[];
  byMonth: OrderMonthlyTrendRow[];
  topProducts: OrderTopProductRow[];
  byRequester: OrderRequesterBreakdownRow[];
  orders: OrderDetailMetricRow[];
}

const bogotaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const monthLabelFormatter = new Intl.DateTimeFormat('es-CO', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseCalendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Usa fechas válidas con formato AAAA-MM-DD.');
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error('La fecha seleccionada no existe en el calendario.');
  }
  return timestamp;
}

export function toBogotaDateString(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) {
    return isoTimestamp.slice(0, 10);
  }
  return bogotaDateFormatter.format(date);
}

export function formatMonthLabel(month: string): string {
  const raw = monthLabelFormatter.format(new Date(`${month}-01T00:00:00Z`));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function defaultOrderReportRange(today = getBogotaCalendarDate()): OrderReportRange {
  const end = new Date(parseCalendarDate(today));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: today,
  };
}

export function validateOrderReportRange(
  from: string,
  to: string,
  today = getBogotaCalendarDate()
): OrderReportRange {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (from < '2000-01-01') {
    throw new Error('La fecha inicial debe ser posterior al año 2000.');
  }
  if (start > end) {
    throw new Error('La fecha inicial no puede ser posterior a la fecha final.');
  }
  if (to > today) {
    throw new Error('La fecha final no puede superar la fecha actual en Colombia.');
  }
  if ((end - start) / 86_400_000 + 1 > ORDER_REPORT_MAX_DAYS) {
    throw new Error(`Consulta como máximo ${ORDER_REPORT_MAX_DAYS} días por informe.`);
  }
  return { from, to };
}

export function diffHoursBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return roundCurrency((end - start) / 3_600_000);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return roundCurrency(sum / values.length);
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return roundCurrency(((current - previous) / previous) * 100);
}

function isApprovedOrProcessed(estado: EstadoPedido): boolean {
  return estado === 'aprobado' || estado === 'en_validacion_imprima' || estado === 'procesado_odoo';
}

function isActiveOrder(estado: EstadoPedido): boolean {
  return estado === 'en_aprobacion' || estado === 'aprobado' || estado === 'en_validacion_imprima';
}

function matchesOrderFilters(order: OrderRecord, filters: OrderReportFilters): boolean {
  if (filters.empresaId && order.empresaId !== filters.empresaId) return false;
  if (filters.sedeId) {
    if (filters.sedeId === 'sin_sede') {
      if (order.sedeId !== null) return false;
    } else if (order.sedeId !== filters.sedeId) {
      return false;
    }
  }
  if (filters.estado !== 'todos' && order.estado !== filters.estado) return false;
  return true;
}

function listCalendarMonthsInRange(from: string, to: string): string[] {
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime() && months.length < 24) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function buildOrderMetricsReport(input: {
  orders: readonly OrderRecord[];
  items: readonly OrderItemRecord[];
  siteBudgets: readonly SiteBudgetRecord[];
  empresas: readonly OrderReportEmpresaOption[];
  sedes: readonly OrderReportSedeOption[];
  range: OrderReportRange;
  filters: OrderReportFilters;
  showPrices: boolean;
  generatedAt?: string;
}): OrderMetricsReport {
  const { orders, items, siteBudgets, empresas, sedes, range, filters, showPrices } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const previousRange = financialComparison(range).range;

  const itemsByOrder = new Map<string, OrderItemRecord[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.pedidoId) ?? [];
    list.push(item);
    itemsByOrder.set(item.pedidoId, list);
  }

  const orderUnits = (order: OrderRecord): number => {
    const orderItems = itemsByOrder.get(order.id);
    if (!orderItems || orderItems.length === 0) return order.totalItems;
    return roundCurrency(orderItems.reduce((sum, item) => sum + item.cantidad, 0));
  };

  const filteredAllDates = orders.filter((order) => matchesOrderFilters(order, filters));
  const currentOrders = filteredAllDates.filter(
    (order) => order.fechaCreacionDate >= range.from && order.fechaCreacionDate <= range.to
  );
  const previousOrders = filteredAllDates.filter(
    (order) => order.fechaCreacionDate >= previousRange.from && order.fechaCreacionDate <= previousRange.to
  );

  const totalOrders = currentOrders.length;
  const previousTotalOrders = previousOrders.length;
  const activeOrders = currentOrders.filter((order) => isActiveOrder(order.estado)).length;
  const processedOrders = currentOrders.filter((order) => order.estado === 'procesado_odoo').length;
  const approvedOrProcessedOrders = currentOrders.filter((order) => isApprovedOrProcessed(order.estado)).length;
  const rejectedOrders = currentOrders.filter((order) => order.estado === 'rechazado').length;
  const draftOrders = currentOrders.filter((order) => order.estado === 'borrador').length;
  const submittedOrders = totalOrders - draftOrders;
  const exceededBudgetOrders = currentOrders.filter((order) => order.excedePresupuesto).length;
  const syncedWithOdooOrders = currentOrders.filter((order) => order.odooSaleOrderId !== null).length;

  let totalUnits = 0;
  let totalLineItems = 0;
  let rawTotalValue = 0;
  let rawApprovedValue = 0;
  let rawPendingValue = 0;
  const approvalHoursList: number[] = [];
  const validationHoursList: number[] = [];
  const endToEndHoursList: number[] = [];

  for (const order of currentOrders) {
    const units = orderUnits(order);
    const orderItems = itemsByOrder.get(order.id);
    totalUnits += units;
    totalLineItems += orderItems ? orderItems.length : order.totalItems;
    rawTotalValue += order.valorTotalCop;
    if (isApprovedOrProcessed(order.estado)) {
      rawApprovedValue += order.valorTotalCop;
    } else if (order.estado === 'en_aprobacion') {
      rawPendingValue += order.valorTotalCop;
    }

    const approvalHours = diffHoursBetween(order.fechaCreacion, order.fechaAprobacion);
    if (approvalHours !== null) approvalHoursList.push(approvalHours);

    const validationHours = diffHoursBetween(
      order.fechaAprobacion ?? order.fechaCreacion,
      order.fechaValidacion
    );
    if (validationHours !== null) validationHoursList.push(validationHours);

    const endToEndHours = diffHoursBetween(
      order.fechaCreacion,
      order.fechaValidacion ?? order.fechaAprobacion
    );
    if (endToEndHours !== null) endToEndHoursList.push(endToEndHours);
  }

  const rawPreviousValue = previousOrders.reduce((sum, order) => sum + order.valorTotalCop, 0);
  totalUnits = roundCurrency(totalUnits);
  rawTotalValue = roundCurrency(rawTotalValue);
  rawApprovedValue = roundCurrency(rawApprovedValue);
  rawPendingValue = roundCurrency(rawPendingValue);

  const kpis: OrderReportKpis = {
    totalOrders,
    previousTotalOrders,
    ordersChangePercent: percentChange(totalOrders, previousTotalOrders),
    activeOrders,
    processedOrders,
    approvedOrProcessedOrders,
    rejectedOrders,
    draftOrders,
    approvalRatePercent:
      submittedOrders > 0 ? roundCurrency((approvedOrProcessedOrders / submittedOrders) * 100) : null,
    odooSyncRatePercent:
      approvedOrProcessedOrders > 0
        ? roundCurrency((syncedWithOdooOrders / approvedOrProcessedOrders) * 100)
        : null,
    exceededBudgetOrders,
    totalUnits,
    totalLineItems,
    avgUnitsPerOrder: totalOrders > 0 ? roundCurrency(totalUnits / totalOrders) : null,
    totalValueCop: showPrices ? rawTotalValue : null,
    previousTotalValueCop: showPrices ? roundCurrency(rawPreviousValue) : null,
    valueChangePercent: showPrices ? percentChange(rawTotalValue, rawPreviousValue) : null,
    approvedValueCop: showPrices ? rawApprovedValue : null,
    pendingApprovalValueCop: showPrices ? rawPendingValue : null,
    avgTicketCop: showPrices && totalOrders > 0 ? roundCurrency(rawTotalValue / totalOrders) : null,
    avgApprovalHours: average(approvalHoursList),
    avgValidationHours: average(validationHoursList),
    avgEndToEndHours: average(endToEndHoursList),
  };

  // 1. Por estado
  const byStatus: OrderStatusBreakdownRow[] = ORDER_STATUSES.map((estado) => {
    const matching = currentOrders.filter((order) => order.estado === estado);
    const units = roundCurrency(matching.reduce((sum, order) => sum + orderUnits(order), 0));
    const value = roundCurrency(matching.reduce((sum, order) => sum + order.valorTotalCop, 0));
    return {
      estado,
      label: ORDER_STATUS_LABELS[estado],
      count: matching.length,
      sharePercent: totalOrders > 0 ? roundCurrency((matching.length / totalOrders) * 100) : 0,
      units,
      valueCop: showPrices ? value : null,
    };
  });

  // 2. Por sede y ejecución presupuestal
  const budgetBySiteId = new Map<string, SiteBudgetRecord>(
    siteBudgets.map((budget) => [budget.sedeId, budget])
  );
  const siteGroups = new Map<string, { sedeId: string | null; sedeNombre: string; ciudad: string | null; orders: OrderRecord[] }>();

  for (const budget of siteBudgets) {
    if (filters.empresaId && budget.empresaId !== filters.empresaId) continue;
    if (filters.sedeId && filters.sedeId !== budget.sedeId) continue;
    siteGroups.set(budget.sedeId, {
      sedeId: budget.sedeId,
      sedeNombre: budget.sedeNombre,
      ciudad: budget.ciudad,
      orders: [],
    });
  }

  for (const order of currentOrders) {
    const key = order.sedeId ?? 'sin_sede';
    const existing = siteGroups.get(key) ?? {
      sedeId: order.sedeId,
      sedeNombre: order.sedeNombre,
      ciudad: order.sedeCiudad,
      orders: [],
    };
    existing.orders.push(order);
    siteGroups.set(key, existing);
  }

  const bySite: OrderSiteBreakdownRow[] = [...siteGroups.values()]
    .map((group) => {
      const budget = group.sedeId ? budgetBySiteId.get(group.sedeId) : undefined;
      const units = roundCurrency(group.orders.reduce((sum, order) => sum + orderUnits(order), 0));
      const periodValue = roundCurrency(group.orders.reduce((sum, order) => sum + order.valorTotalCop, 0));
      const budgetBase =
        budget?.montoInicialMes !== null && budget?.montoInicialMes !== undefined && budget.montoInicialMes > 0
          ? budget.montoInicialMes
          : budget && budget.presupuestoAsignadoSede > 0
            ? budget.presupuestoAsignadoSede
            : null;
      const consumedMonth =
        budget?.montoConsumidoMes !== null && budget?.montoConsumidoMes !== undefined
          ? budget.montoConsumidoMes
          : null;
      const availableMonth =
        budget?.montoDisponibleMes !== null && budget?.montoDisponibleMes !== undefined
          ? budget.montoDisponibleMes
          : budgetBase !== null && consumedMonth !== null
            ? roundCurrency(budgetBase - consumedMonth)
            : null;
      const executionBase = consumedMonth ?? periodValue;
      const executionPercent =
        budgetBase !== null && budgetBase > 0 ? roundCurrency((executionBase / budgetBase) * 100) : null;

      return {
        sedeId: group.sedeId,
        sedeNombre: group.sedeNombre,
        ciudad: group.ciudad,
        orderCount: group.orders.length,
        approvedOrderCount: group.orders.filter((order) => isApprovedOrProcessed(order.estado)).length,
        pendingOrderCount: group.orders.filter((order) => order.estado === 'en_aprobacion').length,
        rejectedOrderCount: group.orders.filter((order) => order.estado === 'rechazado').length,
        exceededCount: group.orders.filter((order) => order.excedePresupuesto).length,
        units,
        periodValueCop: showPrices ? periodValue : null,
        budgetAssignedCop: showPrices && budgetBase !== null ? roundCurrency(budgetBase) : null,
        budgetConsumedMonthCop: showPrices && consumedMonth !== null ? roundCurrency(consumedMonth) : null,
        budgetAvailableMonthCop: showPrices && availableMonth !== null ? roundCurrency(availableMonth) : null,
        budgetExecutionPercent: executionPercent,
        alertaThreshold: budget?.alertaThreshold ?? 90,
      };
    })
    .filter((row) => row.orderCount > 0 || row.budgetAssignedCop !== null)
    .sort((a, b) => (b.periodValueCop ?? b.orderCount) - (a.periodValueCop ?? a.orderCount) || a.sedeNombre.localeCompare(b.sedeNombre, 'es'));

  // 3. Evolución mensual
  const months = listCalendarMonthsInRange(range.from, range.to);
  const byMonth: OrderMonthlyTrendRow[] = months.map((month) => {
    const monthOrders = currentOrders.filter((order) => order.fechaCreacionDate.slice(0, 7) === month);
    const units = roundCurrency(monthOrders.reduce((sum, order) => sum + orderUnits(order), 0));
    const value = roundCurrency(monthOrders.reduce((sum, order) => sum + order.valorTotalCop, 0));
    const approvalTimes = monthOrders
      .map((order) => diffHoursBetween(order.fechaCreacion, order.fechaAprobacion))
      .filter((val): val is number => val !== null);

    return {
      month,
      label: formatMonthLabel(month),
      orderCount: monthOrders.length,
      approvedCount: monthOrders.filter((order) => isApprovedOrProcessed(order.estado)).length,
      processedCount: monthOrders.filter((order) => order.estado === 'procesado_odoo').length,
      rejectedCount: monthOrders.filter((order) => order.estado === 'rechazado').length,
      units,
      valueCop: showPrices ? value : null,
      avgTicketCop: showPrices && monthOrders.length > 0 ? roundCurrency(value / monthOrders.length) : null,
      avgApprovalHours: average(approvalTimes),
    };
  });

  // 4. Top productos solicitados
  const productGroups = new Map<
    string,
    {
      odooProductId: number | null;
      nombreProducto: string;
      tipoItem: TipoPedidoItem;
      unidad: string;
      orderIds: Set<string>;
      totalQuantity: number;
      subtotalCop: number;
    }
  >();

  for (const order of currentOrders) {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    for (const item of orderItems) {
      const normalizedName = item.nombreProducto.trim() || 'Producto sin nombre';
      const normalizedUnit = item.unidad.trim() || 'Und';
      const key =
        item.odooProductId !== null
          ? `odoo:${item.odooProductId}:${normalizedUnit.toLocaleLowerCase('es')}`
          : `esp:${normalizedName.toLocaleLowerCase('es')}:${normalizedUnit.toLocaleLowerCase('es')}`;
      const group = productGroups.get(key) ?? {
        odooProductId: item.odooProductId,
        nombreProducto: normalizedName,
        tipoItem: item.tipoItem,
        unidad: normalizedUnit,
        orderIds: new Set<string>(),
        totalQuantity: 0,
        subtotalCop: 0,
      };
      group.orderIds.add(order.id);
      group.totalQuantity += item.cantidad;
      group.subtotalCop += item.subtotalCop;
      productGroups.set(key, group);
    }
  }

  const totalCatalogUnits = [...productGroups.values()].reduce((sum, group) => sum + group.totalQuantity, 0);
  const topProducts: OrderTopProductRow[] = [...productGroups.entries()]
    .map(([key, group]) => {
      const qty = roundCurrency(group.totalQuantity);
      const subtotal = roundCurrency(group.subtotalCop);
      return {
        key,
        odooProductId: group.odooProductId,
        nombreProducto: group.nombreProducto,
        tipoItem: group.tipoItem,
        unidad: group.unidad,
        orderCount: group.orderIds.size,
        totalQuantity: qty,
        avgUnitPriceCop: showPrices && qty > 0 ? roundCurrency(subtotal / qty) : null,
        subtotalCop: showPrices ? subtotal : null,
        shareUnitsPercent: totalCatalogUnits > 0 ? roundCurrency((qty / totalCatalogUnits) * 100) : 0,
      };
    })
    .sort((a, b) => (b.subtotalCop ?? b.totalQuantity) - (a.subtotalCop ?? a.totalQuantity) || b.totalQuantity - a.totalQuantity || a.nombreProducto.localeCompare(b.nombreProducto, 'es'));

  // 5. Desglose por usuario solicitante
  const requesterGroups = new Map<string, { usuarioId: string; nombre: string; email: string | null; orders: OrderRecord[] }>();
  for (const order of currentOrders) {
    const group = requesterGroups.get(order.creadorId) ?? {
      usuarioId: order.creadorId,
      nombre: order.creadorNombre,
      email: order.creadorEmail,
      orders: [],
    };
    group.orders.push(order);
    requesterGroups.set(order.creadorId, group);
  }

  const byRequester: OrderRequesterBreakdownRow[] = [...requesterGroups.values()]
    .map((group) => {
      const units = roundCurrency(group.orders.reduce((sum, order) => sum + orderUnits(order), 0));
      const value = roundCurrency(group.orders.reduce((sum, order) => sum + order.valorTotalCop, 0));
      return {
        usuarioId: group.usuarioId,
        nombre: group.nombre,
        email: group.email,
        orderCount: group.orders.length,
        approvedCount: group.orders.filter((order) => isApprovedOrProcessed(order.estado)).length,
        pendingCount: group.orders.filter((order) => order.estado === 'en_aprobacion').length,
        rejectedCount: group.orders.filter((order) => order.estado === 'rechazado').length,
        units,
        valueCop: showPrices ? value : null,
        avgTicketCop: showPrices && group.orders.length > 0 ? roundCurrency(value / group.orders.length) : null,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount || a.nombre.localeCompare(b.nombre, 'es'));

  // 6. Listado detallado de pedidos
  const detailOrders: OrderDetailMetricRow[] = [...currentOrders]
    .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))
    .map((order) => ({
      id: order.id,
      numero: order.numero,
      fechaCreacion: order.fechaCreacion,
      fechaCreacionDate: order.fechaCreacionDate,
      empresaNombre: order.empresaNombre,
      sedeId: order.sedeId,
      sedeNombre: order.sedeNombre,
      creadorNombre: order.creadorNombre,
      estado: order.estado,
      estadoLabel: ORDER_STATUS_LABELS[order.estado],
      totalItems: itemsByOrder.get(order.id)?.length ?? order.totalItems,
      totalUnits: orderUnits(order),
      valorTotalCop: showPrices ? roundCurrency(order.valorTotalCop) : null,
      excedePresupuesto: order.excedePresupuesto,
      odooSaleOrderId: order.odooSaleOrderId,
      approvalHours: diffHoursBetween(order.fechaCreacion, order.fechaAprobacion),
      validationHours: diffHoursBetween(order.fechaAprobacion ?? order.fechaCreacion, order.fechaValidacion),
    }));

  const budgetMonth = range.to.slice(0, 7);
  const [budgetYearStr, budgetMonthStr] = budgetMonth.split('-');

  return {
    generatedAt,
    range,
    previousRange,
    budgetPeriod: {
      year: Number(budgetYearStr),
      month: Number(budgetMonthStr),
      period: budgetMonth,
      label: formatMonthLabel(budgetMonth),
    },
    showPrices,
    filters,
    empresas: [...empresas],
    sedes: [...sedes],
    kpis,
    byStatus,
    bySite,
    byMonth,
    topProducts,
    byRequester,
    orders: detailOrders,
  };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",;\n\r]/.test(safeText)) {
    return `"${safeText.replace(/"/g, '""')}"`;
  }
  return safeText;
}

export function buildOrdersCsv(report: OrderMetricsReport): string {
  const headers = [
    'Pedido',
    'Fecha',
    'Empresa',
    'Sede',
    'Solicitante',
    'Estado',
    'Líneas',
    'Unidades',
    ...(report.showPrices ? ['Valor Total COP'] : []),
    'Excede Presupuesto',
    'Orden Odoo ID',
    'Horas Aprobación',
    'Horas Validación',
  ];

  const rows = report.orders.map((order) => [
    order.numero,
    order.fechaCreacionDate,
    order.empresaNombre,
    order.sedeNombre,
    order.creadorNombre,
    order.estadoLabel,
    order.totalItems,
    order.totalUnits,
    ...(report.showPrices ? [order.valorTotalCop ?? 0] : []),
    order.excedePresupuesto ? 'Sí' : 'No',
    order.odooSaleOrderId ?? '',
    order.approvalHours ?? '',
    order.validationHours ?? '',
  ]);

  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildProductsCsv(report: OrderMetricsReport): string {
  const headers = [
    'Producto',
    'ID Odoo',
    'Tipo',
    'Unidad',
    'Pedidos',
    'Cantidad Total',
    'Participación Unidades %',
    ...(report.showPrices ? ['Precio Unitario Promedio COP', 'Subtotal Acumulado COP'] : []),
  ];

  const rows = report.topProducts.map((product) => [
    product.nombreProducto,
    product.odooProductId ?? 'Especial',
    product.tipoItem === 'especial' ? 'Especial' : 'Catálogo',
    product.unidad,
    product.orderCount,
    product.totalQuantity,
    product.shareUnitsPercent,
    ...(report.showPrices ? [product.avgUnitPriceCop ?? 0, product.subtotalCop ?? 0] : []),
  ]);

  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}`;
}
