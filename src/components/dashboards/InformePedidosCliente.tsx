'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import {
  buildOrdersCsv,
  buildProductsCsv,
  defaultOrderReportRange,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  validateOrderReportRange,
  type OrderMetricsReport,
  type OrderReportRange,
} from '@/lib/informes/pedidos';
import { cn, formatCOP, formatDate } from '@/lib/utils';
import type { EstadoPedido } from '@/types';
import {
  AlertTriangle,
  BarChart3,
  BadgeCheck,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  DollarSign,
  Download,
  Eye,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';

interface InformePedidosClienteProps {
  fixedEmpresaId?: string;
  empresaNombre?: string;
  embedded?: boolean;
}

const PAGE_SIZE = 15;

const numberFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 2,
});

function formatDurationHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return 'Sin registro';
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }
  if (hours < 24) {
    return `${numberFormatter.format(hours)} h`;
  }
  const days = hours / 24;
  return `${numberFormatter.format(days)} d (${numberFormatter.format(hours)} h)`;
}

function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildPresetRange(
  preset: 'current_month' | 'previous_month' | 'last_3_months' | 'last_6_months' | 'current_year',
  today: string
): OrderReportRange {
  const [yearStr, monthStr] = today.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  if (preset === 'current_month') {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (preset === 'previous_month') {
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = new Date(Date.UTC(year, monthIndex, 0));
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }
  if (preset === 'last_3_months') {
    const start = new Date(Date.UTC(year, monthIndex - 2, 1));
    return {
      from: start.toISOString().slice(0, 10),
      to: today,
    };
  }
  if (preset === 'current_year') {
    return {
      from: `${year}-01-01`,
      to: today,
    };
  }
  return defaultOrderReportRange(today);
}

export default function InformePedidosCliente({
  fixedEmpresaId,
  empresaNombre,
  embedded = false,
}: InformePedidosClienteProps) {
  const { user } = useAuth();
  const baseId = useId();
  const today = useMemo(() => getBogotaCalendarDate(), []);

  const [range, setRange] = useState<OrderReportRange>(() => defaultOrderReportRange(today));
  const [draftRange, setDraftRange] = useState<OrderReportRange>(range);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>(() => fixedEmpresaId ?? '');
  const [selectedSedeId, setSelectedSedeId] = useState<string>('all');
  const [selectedEstado, setSelectedEstado] = useState<EstadoPedido | 'todos'>('todos');
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [report, setReport] = useState<OrderMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPage, setOrderPage] = useState(1);

  const isClientUser = user?.rol === 'comprador' || user?.rol === 'aprobador';
  const effectiveEmpresaId = fixedEmpresaId ?? (isClientUser ? (user?.empresa_id ?? '') : selectedEmpresaId);

  const rangeValidationError = useMemo(() => {
    try {
      validateOrderReportRange(draftRange.from, draftRange.to, today);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Rango de fechas no válido.';
    }
  }, [draftRange.from, draftRange.to, today]);

  useEffect(() => {
    if (!user?.id) return;

    const controller = new AbortController();
    const fetchReport = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          desde: range.from,
          hasta: range.to,
        });
        if (effectiveEmpresaId && effectiveEmpresaId !== 'all') {
          params.set('empresa_id', effectiveEmpresaId);
        }
        if (selectedSedeId && selectedSedeId !== 'all') {
          params.set('sede_id', selectedSedeId);
        }
        if (selectedEstado && selectedEstado !== 'todos') {
          params.set('estado', selectedEstado);
        }

        const response = await fetch(`/api/informes/pedidos?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!response.ok || !payload) {
          throw new Error(
            (payload && typeof payload.error === 'string' && payload.error) ||
              'No se pudo cargar el informe de pedidos.'
          );
        }

        setReport(payload as OrderMetricsReport);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el informe de pedidos.');
          setReport(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchReport();
    return () => controller.abort();
  }, [user?.id, range.from, range.to, effectiveEmpresaId, selectedSedeId, selectedEstado, refreshCounter]);

  const applyPreset = useCallback(
    (preset: 'current_month' | 'previous_month' | 'last_3_months' | 'last_6_months' | 'current_year') => {
      const next = buildPresetRange(preset, today);
      setDraftRange(next);
      setRange(next);
      setProductPage(1);
      setOrderPage(1);
    },
    [today]
  );

  const handleApplyRange = (event: React.FormEvent) => {
    event.preventDefault();
    if (rangeValidationError) return;
    setRange(draftRange);
    setProductPage(1);
    setOrderPage(1);
  };

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    const term = productSearch.trim().toLocaleLowerCase('es');
    if (!term) return report.topProducts;
    return report.topProducts.filter((item) =>
      `${item.nombreProducto} ${item.odooProductId ?? ''} ${item.unidad}`.toLocaleLowerCase('es').includes(term)
    );
  }, [report, productSearch]);

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentProductPage = Math.min(productPage, totalProductPages);

  const filteredOrders = useMemo(() => {
    if (!report) return [];
    const term = orderSearch.trim().toLocaleLowerCase('es');
    if (!term) return report.orders;
    return report.orders.filter((item) =>
      `${item.numero} ${item.sedeNombre} ${item.creadorNombre} ${item.estadoLabel} ${item.odooSaleOrderId ?? ''}`
        .toLocaleLowerCase('es')
        .includes(term)
    );
  }, [report, orderSearch]);

  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentOrderPage = Math.min(orderPage, totalOrderPages);

  const availableSedes = useMemo(() => {
    if (!report) return [];
    if (!effectiveEmpresaId || effectiveEmpresaId === 'all') return report.sedes;
    return report.sedes.filter((sede) => sede.empresaId === effectiveEmpresaId);
  }, [report, effectiveEmpresaId]);

  const maxMonthMetric = useMemo(() => {
    if (!report || report.byMonth.length === 0) return 1;
    return Math.max(
      ...report.byMonth.map((m) => (report.showPrices ? (m.valueCop ?? 0) : m.orderCount)),
      1
    );
  }, [report]);

  const showPrices = report?.showPrices ?? false;

  return (
    <div className="space-y-6">
      {/* Encabezado y acciones de exportación */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className={cn(embedded ? 'text-xl font-bold text-foreground' : 'text-2xl font-bold text-foreground')}>
            {empresaNombre ? `Informes de Pedidos · ${empresaNombre}` : 'Informes y Métricas de Pedidos'}
          </h1>
          <p className="text-sm text-muted mt-1">
            Indicadores de volumen, estados, consumo por sede, ejecución presupuestal, productos solicitados y tiempos de respuesta
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {report && report.orders.length > 0 && (
            <>
              <button
                type="button"
                onClick={() =>
                  downloadCsvFile(
                    `informe-pedidos-${report.range.from}-a-${report.range.to}.csv`,
                    buildOrdersCsv(report)
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-background-light transition-colors"
              >
                <Download className="w-4 h-4 text-primary" />
                Exportar pedidos (CSV/Excel)
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadCsvFile(
                    `informe-productos-${report.range.from}-a-${report.range.to}.csv`,
                    buildProductsCsv(report)
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-background-light transition-colors"
              >
                <Download className="w-4 h-4 text-primary" />
                Exportar productos (CSV/Excel)
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setRefreshCounter((c) => c + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-background-light disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Barra de filtros */}
      <form
        onSubmit={handleApplyRange}
        className="rounded-xl border border-border bg-white p-4 space-y-4"
        aria-label="Filtros del informe de pedidos"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted flex items-center gap-1 mr-1">
            <Calendar className="w-3.5 h-3.5" />
            Período rápido:
          </span>
          {[
            { id: 'current_month', label: 'Mes actual' },
            { id: 'previous_month', label: 'Mes anterior' },
            { id: 'last_3_months', label: 'Últimos 3 meses' },
            { id: 'last_6_months', label: 'Últimos 6 meses' },
            { id: 'current_year', label: 'Año actual' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                applyPreset(
                  preset.id as
                    | 'current_month'
                    | 'previous_month'
                    | 'last_3_months'
                    | 'last_6_months'
                    | 'current_year'
                )
              }
              className="rounded-full border border-border bg-background-light px-3 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {!fixedEmpresaId && !isClientUser && (report?.empresas.length ?? 0) > 1 && (
            <div>
              <label htmlFor={`${baseId}-empresa`} className="block text-xs font-medium text-muted mb-1">
                Empresa cliente
              </label>
              <select
                id={`${baseId}-empresa`}
                value={selectedEmpresaId || 'all'}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? '' : e.target.value;
                  setSelectedEmpresaId(val);
                  setSelectedSedeId('all');
                  setProductPage(1);
                  setOrderPage(1);
                }}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
              >
                <option value="all">Todas las empresas</option>
                {report?.empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor={`${baseId}-sede`} className="block text-xs font-medium text-muted mb-1">
              Sede
            </label>
            <select
              id={`${baseId}-sede`}
              value={selectedSedeId}
              onChange={(e) => {
                setSelectedSedeId(e.target.value);
                setProductPage(1);
                setOrderPage(1);
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
            >
              <option value="all">Todas las sedes autorizadas</option>
              {availableSedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                  {sede.ciudad ? ` (${sede.ciudad})` : ''}
                </option>
              ))}
              <option value="sin_sede">Sin sede asignada</option>
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-estado`} className="block text-xs font-medium text-muted mb-1">
              Estado del pedido
            </label>
            <select
              id={`${baseId}-estado`}
              value={selectedEstado}
              onChange={(e) => {
                setSelectedEstado(e.target.value as EstadoPedido | 'todos');
                setProductPage(1);
                setOrderPage(1);
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
            >
              <option value="todos">Todos los estados</option>
              {ORDER_STATUSES.map((estado) => (
                <option key={estado} value={estado}>
                  {ORDER_STATUS_LABELS[estado]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-desde`} className="block text-xs font-medium text-muted mb-1">
              Desde
            </label>
            <input
              id={`${baseId}-desde`}
              type="date"
              value={draftRange.from}
              max={draftRange.to || today}
              onChange={(e) => setDraftRange((prev) => ({ ...prev, from: e.target.value }))}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor={`${baseId}-hasta`} className="block text-xs font-medium text-muted mb-1">
                Hasta
              </label>
              <input
                id={`${baseId}-hasta`}
                type="date"
                value={draftRange.to}
                min={draftRange.from}
                max={today}
                onChange={(e) => setDraftRange((prev) => ({ ...prev, to: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={!!rangeValidationError || loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>

        {rangeValidationError && (
          <p role="alert" className="text-xs text-danger font-medium">
            {rangeValidationError}
          </p>
        )}
      </form>

      {error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-14 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted mt-2">Calculando métricas de pedidos...</p>
        </div>
      ) : (
        report && (
          <>
            {/* KPIs Principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <KpiCard
                title="Total de Pedidos"
                value={String(report.kpis.totalOrders)}
                subtitle={`${report.kpis.approvedOrProcessedOrders} aprobados/procesados · ${report.kpis.activeOrders} en curso`}
                icon={<ClipboardList className="w-5 h-5" />}
                trend={
                  report.kpis.ordersChangePercent !== null
                    ? {
                        value: `${report.kpis.ordersChangePercent >= 0 ? '+' : ''}${report.kpis.ordersChangePercent}% vs período anterior (${report.kpis.previousTotalOrders})`,
                        positive: report.kpis.ordersChangePercent >= 0,
                      }
                    : undefined
                }
              />

              {showPrices ? (
                <KpiCard
                  title="Valor Total Solicitado"
                  value={formatCOP(report.kpis.totalValueCop ?? 0)}
                  subtitle={`Aprobado/procesado: ${formatCOP(report.kpis.approvedValueCop ?? 0)}`}
                  icon={<DollarSign className="w-5 h-5" />}
                  trend={
                    report.kpis.valueChangePercent !== null
                      ? {
                          value: `${report.kpis.valueChangePercent >= 0 ? '+' : ''}${report.kpis.valueChangePercent}% vs período anterior`,
                          positive: report.kpis.valueChangePercent >= 0,
                        }
                      : undefined
                  }
                />
              ) : (
                <KpiCard
                  title="Unidades Solicitadas"
                  value={numberFormatter.format(report.kpis.totalUnits)}
                  subtitle={`${report.kpis.totalLineItems} líneas de producto en ${report.kpis.totalOrders} pedidos`}
                  icon={<Package className="w-5 h-5" />}
                />
              )}

              <KpiCard
                title={showPrices ? 'Ticket Promedio por Pedido' : 'Promedio Unidades / Pedido'}
                value={
                  showPrices
                    ? formatCOP(report.kpis.avgTicketCop ?? 0)
                    : `${numberFormatter.format(report.kpis.avgUnitsPerOrder ?? 0)} und.`
                }
                subtitle={`${numberFormatter.format(report.kpis.totalUnits)} unidades totales (${numberFormatter.format(report.kpis.avgUnitsPerOrder ?? 0)} und/pedido)`}
                icon={<TrendingUp className="w-5 h-5" />}
              />

              <KpiCard
                title="Tasa de Aprobación y Sincronización"
                value={
                  report.kpis.approvalRatePercent !== null
                    ? `${numberFormatter.format(report.kpis.approvalRatePercent)}%`
                    : '—'
                }
                subtitle={`${report.kpis.processedOrders} procesados en Odoo · ${report.kpis.rejectedOrders} rechazados`}
                icon={<BadgeCheck className="w-5 h-5" />}
              />

              <KpiCard
                title="Tiempo Promedio de Aprobación"
                value={formatDurationHours(report.kpis.avgApprovalHours)}
                subtitle={`Validación Imprima: ${formatDurationHours(report.kpis.avgValidationHours)}`}
                icon={<Clock className="w-5 h-5" />}
              />

              <KpiCard
                title="Control de Presupuesto"
                value={`${report.kpis.exceededBudgetOrders} con exceso`}
                subtitle={
                  showPrices && (report.kpis.pendingApprovalValueCop ?? 0) > 0
                    ? `En aprobación: ${formatCOP(report.kpis.pendingApprovalValueCop ?? 0)}`
                    : `${report.bySite.length} sede(s) con actividad o presupuesto`
                }
                icon={<AlertTriangle className="w-5 h-5" />}
              />
            </div>

            {/* Evolución mensual y Distribución por estado */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Evolución mensual */}
              <section
                className="xl:col-span-2 rounded-xl border border-border bg-white p-5 space-y-4"
                aria-label="Evolución mensual de pedidos"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-foreground flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      Evolución Mensual y Tiempos de Aprobación
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      Comportamiento mes a mes dentro del rango ({report.range.from} a {report.range.to})
                    </p>
                  </div>
                </div>

                {report.byMonth.every((m) => m.orderCount === 0) ? (
                  <p className="text-sm text-muted py-8 text-center">
                    No hay pedidos registrados en los meses del período seleccionado.
                  </p>
                ) : (
                  <>
                    <div className="flex items-end gap-3 h-44 pt-4 px-2 border-b border-border pb-3 overflow-x-auto">
                      {report.byMonth.map((m) => {
                        const metricValue = showPrices ? (m.valueCop ?? 0) : m.orderCount;
                        const pct = maxMonthMetric > 0 ? (metricValue / maxMonthMetric) * 100 : 0;
                        return (
                          <div key={m.month} className="flex-1 min-w-16 flex flex-col items-center gap-1">
                            <span className="text-[11px] font-semibold text-foreground text-center">
                              {showPrices ? formatCOP(m.valueCop ?? 0) : `${m.orderCount} ped.`}
                            </span>
                            <div className="w-full flex items-end justify-center" style={{ height: '110px' }}>
                              <div
                                className="w-full max-w-12 bg-primary/85 rounded-t-md transition-all"
                                style={{ height: `${Math.max(pct, m.orderCount > 0 ? 6 : 2)}%` }}
                                title={`${m.label}: ${m.orderCount} pedidos`}
                              />
                            </div>
                            <span className="text-xs font-medium text-foreground">{m.label}</span>
                            <span className="text-[11px] text-muted">{m.orderCount} ped. · {numberFormatter.format(m.units)} und.</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="overflow-x-auto" role="region" aria-label="Tabla de evolución mensual" tabIndex={0}>
                      <table className="w-full text-sm">
                        <caption className="sr-only">Detalle mensual de pedidos, unidades, valores y tiempos</caption>
                        <thead>
                          <tr className="border-b border-border bg-background-light/50">
                            <th scope="col" className="text-left py-2.5 px-3 font-medium text-muted">Mes</th>
                            <th scope="col" className="text-right py-2.5 px-3 font-medium text-muted">Pedidos</th>
                            <th scope="col" className="text-right py-2.5 px-3 font-medium text-muted">Aprob./Proc.</th>
                            <th scope="col" className="text-right py-2.5 px-3 font-medium text-muted">Unidades</th>
                            {showPrices && (
                              <>
                                <th scope="col" className="text-right py-2.5 px-3 font-medium text-muted">Valor Total</th>
                                <th scope="col" className="text-right py-2.5 px-3 font-medium text-muted">Ticket Prom.</th>
                              </>
                            )}
                            <th scope="col" className="text-right py-2.5 px-3 font-medium text-muted">T. Aprobación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.byMonth.map((m) => (
                            <tr key={m.month} className="border-b border-border/50">
                              <th scope="row" className="text-left py-2.5 px-3 font-medium text-foreground">
                                {m.label}
                              </th>
                              <td className="py-2.5 px-3 text-right tabular-nums">{m.orderCount}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                                {m.approvedCount} ({m.processedCount} Odoo)
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                {numberFormatter.format(m.units)}
                              </td>
                              {showPrices && (
                                <>
                                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                                    {formatCOP(m.valueCop ?? 0)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                                    {m.avgTicketCop !== null ? formatCOP(m.avgTicketCop) : '—'}
                                  </td>
                                </>
                              )}
                              <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                                {formatDurationHours(m.avgApprovalHours)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              {/* Distribución por estado */}
              <section
                className="rounded-xl border border-border bg-white p-5 space-y-4"
                aria-label="Distribución de pedidos por estado"
              >
                <div>
                  <h2 className="font-semibold text-foreground">Distribución por Estado</h2>
                  <p className="text-xs text-muted mt-0.5">
                    Participación sobre los {report.kpis.totalOrders} pedidos del período
                  </p>
                </div>

                <div className="space-y-3">
                  {report.byStatus.map((row) => (
                    <div key={row.estado} className="rounded-lg border border-border/70 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StatusBadge estado={row.estado} />
                          <span className="text-xs text-muted">
                            {row.count} ped. ({numberFormatter.format(row.sharePercent)}%)
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {showPrices ? formatCOP(row.valueCop ?? 0) : `${numberFormatter.format(row.units)} und.`}
                        </span>
                      </div>
                      <div className="w-full bg-background-light rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, row.sharePercent)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span>{numberFormatter.format(row.units)} unidades</span>
                        {showPrices && row.count > 0 && (
                          <span>Prom: {formatCOP(Math.round((row.valueCop ?? 0) / row.count))}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Consumo por Sede y Ejecución Presupuestal */}
            <section
              className="rounded-xl border border-border bg-white overflow-hidden"
              aria-label="Consumo por sede y presupuesto"
            >
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Consumo por Sede y Ejecución Presupuestal
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Pedidos del período consultado y referencia de presupuesto mensual para {report.budgetPeriod.label}
                  </p>
                </div>
              </div>

              {report.bySite.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted">
                  No hay consumo ni presupuestos registrados por sede para los filtros seleccionados.
                </p>
              ) : (
                <div className="overflow-x-auto" role="region" aria-label="Tabla de consumo por sede" tabIndex={0}>
                  <table className="w-full text-sm">
                    <caption className="sr-only">Consumo de pedidos y presupuesto por sede</caption>
                    <thead>
                      <tr className="border-b border-border bg-background-light/50">
                        <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                        <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Pedidos</th>
                        <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Aprob. / Pend. / Rech.</th>
                        <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Unidades</th>
                        {showPrices && (
                          <>
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Consumo Período</th>
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Presupuesto Mes</th>
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Disponible Mes</th>
                          </>
                        )}
                        <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Ejecución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.bySite.map((site) => {
                        const pct = site.budgetExecutionPercent;
                        const isOverThreshold = pct !== null && pct >= site.alertaThreshold;
                        const isExceeded = pct !== null && pct > 100;
                        return (
                          <tr key={site.sedeId ?? 'sin_sede'} className="border-b border-border/50">
                            <th scope="row" className="text-left py-3 px-4 font-medium text-foreground">
                              <div>{site.sedeNombre}</div>
                              {site.ciudad && <span className="text-xs font-normal text-muted">{site.ciudad}</span>}
                              {site.exceededCount > 0 && (
                                <span className="ml-1 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                  {site.exceededCount} con exceso
                                </span>
                              )}
                            </th>
                            <td className="py-3 px-4 text-right tabular-nums font-medium">{site.orderCount}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-muted">
                              {site.approvedOrderCount} / {site.pendingOrderCount} / {site.rejectedOrderCount}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">
                              {numberFormatter.format(site.units)}
                            </td>
                            {showPrices && (
                              <>
                                <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                  {formatCOP(site.periodValueCop ?? 0)}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums text-muted">
                                  {site.budgetAssignedCop !== null ? formatCOP(site.budgetAssignedCop) : 'No asignado'}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums">
                                  {site.budgetAvailableMonthCop !== null ? (
                                    <span className={site.budgetAvailableMonthCop < 0 ? 'text-danger font-semibold' : undefined}>
                                      {formatCOP(site.budgetAvailableMonthCop)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </>
                            )}
                            <td className="py-3 px-4 min-w-44">
                              {pct !== null ? (
                                <div>
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span
                                      className={cn(
                                        'font-semibold',
                                        isExceeded
                                          ? 'text-red-700'
                                          : isOverThreshold
                                            ? 'text-amber-700'
                                            : 'text-foreground'
                                      )}
                                    >
                                      {numberFormatter.format(pct)}%
                                    </span>
                                    <span className="text-muted">Umbral {site.alertaThreshold}%</span>
                                  </div>
                                  <div className="w-full bg-background-light rounded-full h-2 overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-2 rounded-full transition-all',
                                        isExceeded
                                          ? 'bg-red-500'
                                          : isOverThreshold
                                            ? 'bg-amber-500'
                                            : 'bg-primary'
                                      )}
                                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-muted">Sin presupuesto mensual</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Top productos solicitados y Solicitantes */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Top productos */}
              <section
                className="xl:col-span-2 rounded-xl border border-border bg-white overflow-hidden"
                aria-label="Productos más solicitados"
              >
                <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-foreground flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      Top Productos Solicitados ({filteredProducts.length})
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      Ranking de productos y cantidades consolidadas en los pedidos del período
                    </p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setProductPage(1);
                      }}
                      placeholder="Buscar producto o ID Odoo..."
                      aria-label="Buscar en productos solicitados"
                      className="w-full rounded-lg border border-border bg-background-light pl-9 pr-3 py-1.5 text-sm"
                    />
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted">
                    No se encontraron productos solicitados para los filtros actuales.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto" role="region" aria-label="Tabla de productos más solicitados" tabIndex={0}>
                      <table className="w-full text-sm">
                        <caption className="sr-only">Ranking de productos solicitados en pedidos</caption>
                        <thead>
                          <tr className="border-b border-border bg-background-light/50">
                            <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Producto</th>
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Pedidos</th>
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Cantidad</th>
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">% Und.</th>
                            {showPrices && (
                              <>
                                <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Precio Prom.</th>
                                <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Subtotal</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts
                            .slice((currentProductPage - 1) * PAGE_SIZE, currentProductPage * PAGE_SIZE)
                            .map((prod) => (
                              <tr key={prod.key} className="border-b border-border/50">
                                <th scope="row" className="text-left py-3 px-4 font-medium text-foreground">
                                  <div className="leading-snug">{prod.nombreProducto}</div>
                                  <div className="text-xs font-normal text-muted mt-0.5">
                                    {prod.tipoItem === 'especial'
                                      ? 'Producto especial'
                                      : `ID Odoo: ${prod.odooProductId ?? '—'}`}{' '}
                                    · {prod.unidad}
                                  </div>
                                </th>
                                <td className="py-3 px-4 text-right tabular-nums">{prod.orderCount}</td>
                                <td className="py-3 px-4 text-right tabular-nums font-medium">
                                  {numberFormatter.format(prod.totalQuantity)} {prod.unidad}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums text-muted">
                                  {numberFormatter.format(prod.shareUnitsPercent)}%
                                </td>
                                {showPrices && (
                                  <>
                                    <td className="py-3 px-4 text-right tabular-nums text-muted">
                                      {prod.avgUnitPriceCop !== null ? formatCOP(prod.avgUnitPriceCop) : '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                      {formatCOP(prod.subtotalCop ?? 0)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>

                    {totalProductPages > 1 && (
                      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
                        <span>
                          Página {currentProductPage} de {totalProductPages} ({filteredProducts.length} productos)
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={currentProductPage <= 1}
                            onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                            className="rounded border border-border px-2.5 py-1 font-medium text-foreground hover:bg-background-light disabled:opacity-50"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            disabled={currentProductPage >= totalProductPages}
                            onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                            className="rounded border border-border px-2.5 py-1 font-medium text-foreground hover:bg-background-light disabled:opacity-50"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Solicitantes */}
              <section
                className="rounded-xl border border-border bg-white overflow-hidden"
                aria-label="Pedidos por usuario solicitante"
              >
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Pedidos por Solicitante
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Actividad por usuario creador en el período
                  </p>
                </div>

                {report.byRequester.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted">Sin solicitantes en este período.</p>
                ) : (
                  <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
                    {report.byRequester.map((req) => (
                      <div key={req.usuarioId} className="px-5 py-3.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{req.nombre}</p>
                            {req.email && <p className="text-xs text-muted truncate">{req.email}</p>}
                          </div>
                          <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">
                            {showPrices ? formatCOP(req.valueCop ?? 0) : `${req.orderCount} pedido(s)`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between text-xs text-muted gap-2">
                          <span>
                            {req.orderCount} ped. · {req.approvedCount} aprob. · {req.pendingCount} pend.
                            {req.rejectedCount > 0 ? ` · ${req.rejectedCount} rech.` : ''}
                          </span>
                          <span>{numberFormatter.format(req.units)} und.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Tabla detallada de pedidos del período */}
            <section
              className="rounded-xl border border-border bg-white overflow-hidden"
              aria-label="Detalle de pedidos del período"
            >
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Detalle de Pedidos del Período ({filteredOrders.length})
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Trazabilidad completa de cada pedido, tiempos de aprobación y vínculo con Odoo
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => {
                      setOrderSearch(e.target.value);
                      setOrderPage(1);
                    }}
                    placeholder="Buscar por número, sede o usuario..."
                    aria-label="Buscar en pedidos del informe"
                    className="w-full rounded-lg border border-border bg-background-light pl-9 pr-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted">
                  No hay pedidos que coincidan con los filtros seleccionados.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto" role="region" aria-label="Tabla detallada de pedidos" tabIndex={0}>
                    <table className="w-full text-sm">
                      <caption className="sr-only">Listado de pedidos del período con métricas operativas</caption>
                      <thead>
                        <tr className="border-b border-border bg-background-light/50">
                          <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                          <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Fecha</th>
                          <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                          <th scope="col" className="text-left py-3 px-4 font-medium text-muted">Solicitante</th>
                          <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Líneas / Und.</th>
                          {showPrices && (
                            <th scope="col" className="text-right py-3 px-4 font-medium text-muted">Total</th>
                          )}
                          <th scope="col" className="text-right py-3 px-4 font-medium text-muted">T. Aprobación</th>
                          <th scope="col" className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                          <th scope="col" className="text-center py-3 px-4 font-medium text-muted">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders
                          .slice((currentOrderPage - 1) * PAGE_SIZE, currentOrderPage * PAGE_SIZE)
                          .map((order) => (
                            <tr key={order.id} className="border-b border-border/50 hover:bg-background-light/30">
                              <th scope="row" className="text-left py-3 px-4 font-semibold text-foreground">
                                <div className="flex items-center gap-1.5">
                                  <span>{order.numero}</span>
                                  {order.excedePresupuesto && (
                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                      Excede
                                    </span>
                                  )}
                                </div>
                                {order.odooSaleOrderId && (
                                  <span className="block text-[11px] font-normal text-muted">
                                    Odoo #{order.odooSaleOrderId}
                                  </span>
                                )}
                              </th>
                              <td className="py-3 px-4 text-muted">{formatDate(order.fechaCreacion)}</td>
                              <td className="py-3 px-4 text-muted">{order.sedeNombre}</td>
                              <td className="py-3 px-4 text-muted">{order.creadorNombre}</td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                {order.totalItems} / {numberFormatter.format(order.totalUnits)}
                              </td>
                              {showPrices && (
                                <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                  {formatCOP(order.valorTotalCop ?? 0)}
                                </td>
                              )}
                              <td className="py-3 px-4 text-right tabular-nums text-muted">
                                {formatDurationHours(order.approvalHours)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <StatusBadge estado={order.estado} />
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Link
                                  href={`/dashboard/pedidos/${order.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-background-light px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Ver
                                </Link>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {totalOrderPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
                      <span>
                        Página {currentOrderPage} de {totalOrderPages} ({filteredOrders.length} pedidos)
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={currentOrderPage <= 1}
                          onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                          className="rounded border border-border px-2.5 py-1 font-medium text-foreground hover:bg-background-light disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={currentOrderPage >= totalOrderPages}
                          onClick={() => setOrderPage((p) => Math.min(totalOrderPages, p + 1))}
                          className="rounded border border-border px-2.5 py-1 font-medium text-foreground hover:bg-background-light disabled:opacity-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
