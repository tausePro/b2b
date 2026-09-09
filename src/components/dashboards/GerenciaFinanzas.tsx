'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, BadgeDollarSign, Building2, DollarSign, FileText, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import { useAuth } from '@/contexts/AuthContext';
import { userHasAnyRole } from '@/lib/auth/roles';
import { getBogotaCalendarDate, getCommissionPeriodRange, PLATFORM_BONUS_START_DATE } from '@/lib/comisiones/bonoPlataforma';
import type { CommissionPeriodStatus, PlatformBonusTotals } from '@/lib/comisiones/bonoPlataforma';
import { defaultFinancialRange, validateFinancialRange } from '@/lib/gerencia/finanzas';
import type { FinancialFilters, FinancialGroup, FinancialRange, FinancialReport, FinancialTotals } from '@/lib/gerencia/finanzas';

const PAGE_SIZE = 50;
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';
const linkClass = 'text-primary underline decoration-primary/40 underline-offset-4 hover:text-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const inputClass = 'mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground';
const headingCellClass = 'px-4 py-3 text-right font-medium text-muted';
const cellClass = 'px-4 py-3 text-right tabular-nums align-top';
const numberFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const quantityFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 20 });
const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timestampFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });

type DrillFilters = { asesora: string; cliente: string; producto: string; factura: string };
type GerenciaFinanzasProps = { advisorId?: number | null };
type ReadonlyResult<T> = { key: string; data: T | null; error: string | null };
type BonusResponse = {
  period: string;
  results: {
    advisor: { id: string; name: string; odooUserId: number | null };
    period: string;
    percentage: number;
    totals: PlatformBonusTotals;
    status: CommissionPeriodStatus;
    source: 'live' | 'snapshot';
    warnings?: string[];
    blockingIssues?: string[];
    generatedAt: string | null;
    closedAt: string | null;
    paidAt: string | null;
  }[];
};

function dateLabel(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function money(value: number | null): string {
  return value === null ? 'Pendiente' : currencyFormatter.format(value);
}

function percent(value: number | null): string {
  return value === null ? 'No disponible' : `${numberFormatter.format(value)}%`;
}

function positiveId(value: string, label: string): number | undefined {
  if (!value) return undefined;
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) throw new Error(`${label}: usa un ID Odoo entero positivo.`);
  return id;
}

function rangeError(range: FinancialRange, today: string): string | null {
  try {
    validateFinancialRange(range.from, range.to, today);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Revisa el rango de fechas.';
  }
}

function useBogotaToday(): string {
  const [today, setToday] = useState(getBogotaCalendarDate);
  useEffect(() => {
    const update = () => setToday(getBogotaCalendarDate());
    const interval = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
    };
  }, []);
  return today;
}

function useReadonlyJson<T>(url: string | null, userId: string | undefined, refresh: number, validate: (data: T) => void) {
  const key = JSON.stringify([url, userId, refresh]);
  const [result, setResult] = useState<ReadonlyResult<T> | null>(null);
  useEffect(() => {
    if (!url || !userId) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.status === 401 || (response.redirected && new URL(response.url).pathname === '/login')) throw new Error('Tu sesión venció. Vuelve a iniciar sesión para consultar el reporte.');
        if (response.status === 403) throw new Error('No tienes permisos para consultar esta información financiera.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('El servicio no devolvió un reporte válido. Intenta actualizar.');
        if (!response.ok) {
          const message = typeof payload.error === 'string' ? payload.error : 'No se pudo consultar la información. Intenta actualizar.';
          throw new Error(message);
        }
        validate(payload as T);
        setResult({ key, data: payload as T, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, data: null, error: error instanceof Error ? error.message : 'No se pudo consultar la información.' });
      }
    };
    void load();
    return () => controller.abort();
  }, [key, url, userId, validate]);
  const current = url && userId && result?.key === key ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !!url && !!userId && !current };
}

function LoadingReport() {
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted" role="status"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />Consultando información…</div>;
}

function Pagination({ page, totalPages, total, onChange, label }: { page: number; totalPages: number; total: number; onChange: (page: number) => void; label: string }) {
  return (
    <nav aria-label={`Paginación de ${label}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
      <span aria-live="polite">{total} registros · Página {page} de {totalPages}</span>
      <div className="flex gap-2">
        <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={`Página anterior de ${label}`}>Anterior</button>
        <button type="button" className={buttonClass} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={`Página siguiente de ${label}`}>Siguiente</button>
      </div>
    </nav>
  );
}

function AmountCell({ value, verified }: { value: number | null; verified?: number }) {
  return (
    <td className={cellClass}>
      <span className={value === null ? 'font-medium text-amber-800' : undefined}>{money(value)}</span>
      {value === null && verified !== undefined && <span className="mt-1 block text-xs text-muted">Subtotal verificado: {currencyFormatter.format(verified)}</span>}
    </td>
  );
}

function GroupTable({ title, groups, kind, navigation }: { title: string; groups: FinancialGroup[]; kind: 'advisor' | 'client' | 'product'; navigation: (group: FinancialGroup) => ReactNode }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchId = useId();
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return groups.filter((group) => `${group.name} ${group.sku ?? ''} ${group.id ?? ''} ${group.unitName ?? ''}`.toLocaleLowerCase('es').includes(term));
  }, [groups, search]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="font-semibold text-foreground">{title}</h2><p className="mt-1 text-xs text-muted">Todos los grupos del rango y filtros consultados; {PAGE_SIZE} por página.{kind === 'product' && ' Cantidades separadas por producto y unidad de medida.'}</p></div>
        <div><label htmlFor={searchId} className="text-sm text-muted">Buscar en {title.toLowerCase()}</label><input id={searchId} type="search" className={inputClass} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
      </div>
      <div className="overflow-x-auto" role="region" aria-label={`Tabla ${title}`} tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">{title}. Valores COP sin impuestos; importes pendientes no representan cero.</caption>
          <thead><tr className="border-b border-border bg-background-light/50">
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted">{kind === 'advisor' ? 'Asesora' : kind === 'client' ? 'Cliente' : 'Producto / unidad'}</th>
            {kind === 'product' && <th scope="col" className={headingCellClass}>Cantidad</th>}
            <th scope="col" className={headingCellClass}>Facturas / NC</th><th scope="col" className={headingCellClass}>Venta neta</th><th scope="col" className={headingCellClass}>Costo de factura</th><th scope="col" className={headingCellClass}>Utilidad</th><th scope="col" className={headingCellClass}>Margen</th><th scope="col" className={headingCellClass}>Cobertura de costo</th><th scope="col" className={headingCellClass}>Comisión habitual</th>
          </tr></thead>
          <tbody>{rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((group) => (
            <tr key={group.key} className="border-b border-border/50">
              <th scope="row" className="min-w-52 px-4 py-3 text-left align-top font-medium text-foreground">
                {navigation(group)}
                {kind === 'product' && <span className="mt-1 block text-xs font-normal text-muted">SKU: {group.sku ?? 'No disponible'} · {group.unitName}</span>}
              </th>
              {kind === 'product' && <td className={cellClass}>{group.quantity === undefined ? 'No disponible' : quantityFormatter.format(group.quantity)} {group.unitName}</td>}
              <td className={cellClass}>{group.invoiceCount} / {group.creditNoteCount}</td>
              <AmountCell value={group.netSales} /><AmountCell value={group.cost} verified={group.knownCost} /><AmountCell value={group.profit} verified={group.verifiedProfit} />
              <td className={cellClass}>{percent(group.marginPercent)}</td>
              <td className={cellClass}>{percent(group.costCoveragePercent)}<span className="mt-1 block text-xs text-muted">{group.missingCostLines} líneas pendientes</span></td>
              <td className={cellClass}><span className={group.commission === null ? 'font-medium text-amber-800' : undefined}>{money(group.commission)}</span>{group.commission === null && <span className="mt-1 block text-xs text-muted">Subtotal verificado: {currencyFormatter.format(group.knownCommission)} · {group.missingCommissionLines} líneas pendientes</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">No hay resultados{search ? ' para esta búsqueda local' : ' en el rango y filtros consultados'}.</p>}
      <Pagination label={title} page={currentPage} totalPages={totalPages} total={rows.length} onChange={setPage} />
    </section>
  );
}

function Comparison({ report }: { report: FinancialReport }) {
  const metrics: { label: string; field: keyof Pick<FinancialTotals, 'netSales' | 'cost' | 'profit' | 'commission'>; verified?: 'knownCost' | 'verifiedProfit' | 'knownCommission' }[] = [
    { label: 'Venta neta', field: 'netSales' }, { label: 'Costo de factura', field: 'cost', verified: 'knownCost' },
    { label: 'Utilidad', field: 'profit', verified: 'verifiedProfit' }, { label: 'Comisión habitual calculada', field: 'commission', verified: 'knownCommission' },
  ];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white" aria-label="Comparación con periodo anterior">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Comparación con periodo anterior</h2><p className="mt-1 text-xs text-muted">Igual número de días y mismos filtros. Los subtotales verificados no son totales completos.</p></div>
      <div className="overflow-x-auto" role="region" aria-label="Tabla comparativa de periodos" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Comparación del rango actual con el periodo inmediatamente anterior de igual duración</caption>
          <thead><tr className="border-b border-border bg-background-light/50"><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Indicador</th><th scope="col" className={headingCellClass}>Actual: {dateLabel(report.range.from)} – {dateLabel(report.range.to)}</th><th scope="col" className={headingCellClass}>Anterior: {dateLabel(report.previousRange.from)} – {dateLabel(report.previousRange.to)}</th></tr></thead>
          <tbody>
            {metrics.map((metric) => <tr key={metric.field} className="border-b border-border/50"><th scope="row" className="px-4 py-3 text-left font-medium">{metric.label}</th><AmountCell value={report.totals[metric.field]} verified={metric.verified ? report.totals[metric.verified] : undefined} /><AmountCell value={report.previousTotals[metric.field]} verified={metric.verified ? report.previousTotals[metric.verified] : undefined} /></tr>)}
            <tr className="border-b border-border/50"><th scope="row" className="px-4 py-3 text-left font-medium">Cobertura de costo</th>{[report.totals, report.previousTotals].map((totals, index) => <td key={index} className={cellClass}>{percent(totals.costCoveragePercent)} · {totals.missingCostLines} líneas pendientes</td>)}</tr>
            <tr><th scope="row" className="px-4 py-3 text-left font-medium">Líneas pendientes de comisión</th><td className={cellClass}>{report.totals.missingCommissionLines}</td><td className={cellClass}>{report.previousTotals.missingCommissionLines}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrendTable({ report }: { report: FinancialReport }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(report.trend.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  return (
    <details className="overflow-hidden rounded-xl border border-border bg-white">
      <summary className="cursor-pointer px-5 py-4 font-semibold text-foreground">Evolución diaria de la facturación</summary>
      <p className="px-5 pb-4 text-xs text-muted">Solo fechas con líneas registradas. Agregados completos del rango consultado, no de la página de detalle.</p>
      <div className="overflow-x-auto" role="region" aria-label="Tabla de evolución diaria" tabIndex={0}>
        <table className="w-full text-sm"><caption className="sr-only">Venta neta, utilidad y comisión habitual por fecha de factura</caption><thead><tr className="border-y border-border bg-background-light/50"><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Fecha</th><th scope="col" className={headingCellClass}>Venta neta</th><th scope="col" className={headingCellClass}>Utilidad</th><th scope="col" className={headingCellClass}>Comisión habitual</th></tr></thead><tbody>{report.trend.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((row) => <tr key={row.date} className="border-b border-border/50"><th scope="row" className="px-4 py-3 text-left font-medium">{dateLabel(row.date)}</th><AmountCell value={row.netSales} /><AmountCell value={row.profit} /><AmountCell value={row.commission} /></tr>)}</tbody></table>
      </div>
      {report.trend.length === 0 && <p className="px-5 py-6 text-sm text-muted">No hay fechas con facturación en esta consulta.</p>}
      <Pagination label="evolución diaria" page={currentPage} totalPages={totalPages} total={report.trend.length} onChange={setPage} />
    </details>
  );
}

function AdvisorBonus({ portalAdvisorId, period, onPeriodChange, today, userId }: { portalAdvisorId: string | null; period: string; onPeriodChange: (value: string) => void; today: string; userId: string }) {
  const [refresh, setRefresh] = useState(0);
  let validationError: string | null = null;
  try {
    getCommissionPeriodRange(period);
    if (period > today.slice(0, 7)) throw new Error('El periodo no puede ser posterior al mes actual en Bogotá.');
  } catch (error) {
    validationError = error instanceof Error ? error.message : 'Selecciona un periodo mensual válido.';
  }
  const query = new URLSearchParams({ periodo: period, asesor_id: portalAdvisorId ?? '' });
  const validate = useCallback((payload: BonusResponse) => {
    if (payload.period !== period || !Array.isArray(payload.results) || payload.results.length > 1 || payload.results.some((result) => result.period !== period || result.advisor?.id !== portalAdvisorId
      || result.percentage !== 0.5 || !['live', 'snapshot'].includes(result.source) || !['provisional', 'cerrado', 'pagado'].includes(result.status)
      || !result.totals || (['bonus', 'netBase', 'activeClients', 'invoiceCount', 'creditNoteCount'] as const).some((key) => typeof result.totals[key] !== 'number' || !Number.isFinite(result.totals[key])))) throw new Error('La respuesta del bono no corresponde a la asesora y mes solicitados. Actualiza la consulta.');
  }, [period, portalAdvisorId]);
  const { data, error, loading } = useReadonlyJson<BonusResponse>(portalAdvisorId && !validationError ? `/api/comisiones/bono-plataforma?${query}` : null, userId, refresh, validate);
  const result = data?.results[0];
  return (
    <section className="space-y-4 rounded-xl border border-border bg-white p-5" aria-labelledby="advisor-bonus-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl"><h2 id="advisor-bonus-title" className="font-semibold text-foreground">Bono plataforma · 0,5% adicional</h2><p className="mt-1 text-sm text-muted">Consulta independiente de mes completo, únicamente sobre facturación elegible del portal. No se aplica a toda la venta global ni se suma a la comisión habitual del rango superior. Los filtros de cliente, producto y factura no afectan este bono mensual.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium text-foreground">Mes completo del bono<input type="month" className={inputClass} value={period} min={PLATFORM_BONUS_START_DATE.slice(0, 7)} max={today.slice(0, 7)} onChange={(event) => onPeriodChange(event.target.value)} required aria-invalid={!!validationError} aria-describedby="advisor-bonus-period-note" /></label><button type="button" className={buttonClass} disabled={!portalAdvisorId || !!validationError || loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw aria-hidden="true" className="h-4 w-4" />Actualizar bono</button></div>
      </div>
      <p id="advisor-bonus-period-note" className="text-xs text-muted">Disponible desde septiembre de 2026 hasta el mes actual en Bogotá. El mes en curso es provisional hasta el cierre; su alcance sigue siendo mensual.</p>
      {!portalAdvisorId ? <p className="rounded-lg bg-background-light p-4 text-sm text-muted">Bono no disponible: el reporte no confirma una asesora del portal vinculada a este ID Odoo. No se infiere una identidad ni un importe.</p> : <>
        {(validationError || error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validationError || error}</p>}
        {loading && <LoadingReport />}
        {data && !result && <p className="text-sm text-muted">No se encontró una liquidación disponible para esta asesora y mes. No se presenta un bono de cero por ausencia de información.</p>}
        {result && <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard title="Bono mensual" value={currencyFormatter.format(result.totals.bonus)} subtitle={`${numberFormatter.format(result.percentage)}% · ${result.period} · Mes completo`} icon={<BadgeDollarSign aria-hidden="true" className="h-5 w-5" />} />
            <KpiCard title="Base neta elegible del bono" value={currencyFormatter.format(result.totals.netBase)} subtitle="Sin IVA, con notas crédito del cálculo existente" icon={<FileText aria-hidden="true" className="h-5 w-5" />} />
            <KpiCard title="Clientes activos elegibles" value={String(result.totals.activeClients)} subtitle={`${result.totals.invoiceCount} facturas · ${result.totals.creditNoteCount} notas crédito`} icon={<Building2 aria-hidden="true" className="h-5 w-5" />} />
          </div>
          <p className="text-sm text-foreground"><strong>{result.advisor.name}</strong> · Estado: {{ provisional: 'Provisional', cerrado: 'Cerrada', pagado: 'Pagada' }[result.status]} · {result.source === 'snapshot' ? 'Snapshot de liquidación congelada; se conserva el importe registrado.' : 'Cálculo provisional consultado en Odoo; puede cambiar hasta el cierre.'}</p>
          {result.generatedAt && <p className="text-xs text-muted">Generado: {timestampFormatter.format(new Date(result.generatedAt))} (Bogotá)</p>}
          {result.closedAt && <p className="text-xs text-muted">Cierre: {timestampFormatter.format(new Date(result.closedAt))} (Bogotá)</p>}
          {result.paidAt && <p className="text-xs text-muted">Pago registrado: {timestampFormatter.format(new Date(result.paidAt))} (Bogotá). No representa una transferencia desde el portal.</p>}
          {(result.warnings?.length ?? 0) > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-medium">Advertencias del bono</p><ul className="mt-1 list-disc space-y-1 pl-5">{result.warnings?.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
          {(result.blockingIssues?.length ?? 0) > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="font-medium">Incidencias bloqueantes de la liquidación</p><ul className="mt-1 list-disc space-y-1 pl-5">{result.blockingIssues?.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></div>}
        </>}
        {!validationError && <Link className={`${linkClass} inline-block text-sm font-medium`} href={`/dashboard/comisiones?${query}`}>Ver liquidación existente y operaciones manuales</Link>}
      </>}
    </section>
  );
}

function FinancialView({ advisorId, initialQuery, bonusPeriod, onBonusPeriodChange }: GerenciaFinanzasProps & { initialQuery: string; bonusPeriod: string; onBonusPeriodChange: (period: string) => void }) {
  const { user, loading: authLoading } = useAuth();
  const today = useBogotaToday();
  const canAccess = userHasAnyRole(user, ['direccion', 'super_admin']);
  const [range, setRange] = useState<FinancialRange>(() => {
    const query = new URLSearchParams(initialQuery);
    const initial = defaultFinancialRange();
    return { from: query.get('desde') ?? initial.from, to: query.get('hasta') ?? initial.to };
  });
  const [draftRange, setDraftRange] = useState<FinancialRange>(range);
  const [rangePending, setRangePending] = useState(false);
  const [filters, setFilters] = useState<DrillFilters>(() => {
    const query = new URLSearchParams(initialQuery);
    return { asesora: advisorId === undefined ? query.get('asesora') ?? '' : advisorId === null ? 'none' : String(advisorId), cliente: query.get('cliente') ?? '', producto: query.get('producto') ?? '', factura: query.get('factura') ?? '' };
  });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  let validationError = rangeError(rangePending ? draftRange : range, today);
  let requestedFilters: FinancialFilters = { page };
  try {
    requestedFilters = { page, advisorId: filters.asesora === 'none' ? null : positiveId(filters.asesora, 'Asesora'), clientId: positiveId(filters.cliente, 'Cliente'), productId: positiveId(filters.producto, 'Producto'), invoiceId: positiveId(filters.factura, 'Factura') };
  } catch (error) {
    validationError ??= error instanceof Error ? error.message : 'Revisa los filtros.';
  }
  const query = new URLSearchParams({ desde: range.from, hasta: range.to, pagina: String(page) });
  for (const [name, value] of Object.entries(filters)) if (value) query.set(name, value);
  const expectedFilters = JSON.stringify(requestedFilters);
  const validate = useCallback((payload: FinancialReport) => {
    const expected = JSON.parse(expectedFilters) as FinancialFilters;
    if (payload.range?.from !== range.from || payload.range?.to !== range.to || payload.currency !== 'COP'
      || !payload.filters || payload.filters.advisorId !== expected.advisorId || payload.filters.clientId !== expected.clientId
      || payload.filters.productId !== expected.productId || payload.filters.invoiceId !== expected.invoiceId
      || !payload.pagination || payload.pagination.page !== Math.min(expected.page, payload.pagination.totalPages)
      || payload.filters.page !== payload.pagination.page
      || (payload.selectedAdvisor && payload.selectedAdvisor.id !== expected.advisorId)) {
      throw new Error('La respuesta no corresponde al rango, filtros y página solicitados. Actualiza la consulta.');
    }
  }, [expectedFilters, range.from, range.to]);
  const { data: report, error, loading } = useReadonlyJson<FinancialReport>(!authLoading && canAccess && !rangePending && !validationError ? `/api/gerencia/finanzas?${query}` : null, user?.id, refresh, validate);
  const isAdvisor = filters.asesora !== '';
  const selectedAdvisor = report?.selectedAdvisor ?? report?.advisors.find((group) => group.id === requestedFilters.advisorId);
  const dateQuery = new URLSearchParams({ desde: range.from, hasta: range.to });
  const generalHref = `/dashboard/gerencia?${dateQuery}`;
  const advisorHref = (id: number | null) => {
    const params = new URLSearchParams(dateQuery);
    for (const name of ['cliente', 'producto', 'factura'] as const) if (filters[name]) params.set(name, filters[name]);
    return `/dashboard/comisiones/asesoras/${id ?? 'none'}?${params}`;
  };
  const editRange = (nextRange: FinancialRange) => {
    setDraftRange(nextRange);
    setRangePending(true);
  };
  const applyRange = (nextRange: FinancialRange) => {
    if (rangeError(nextRange, getBogotaCalendarDate())) return;
    const params = new URLSearchParams({ desde: nextRange.from, hasta: nextRange.to });
    for (const [name, value] of Object.entries(filters)) if (value) params.set(name, value);
    setDraftRange(nextRange);
    if (params.toString() !== initialQuery) {
      setRangePending(true);
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
      return;
    }
    setRange(nextRange);
    setRangePending(false);
    setPage(1);
    setRefresh((value) => value + 1);
  };
  const updateFilter = (name: keyof DrillFilters, value: string) => { setFilters((previous) => ({ ...previous, [name]: value })); setPage(1); };
  const clearDetails = () => { setFilters((previous) => ({ ...previous, cliente: '', producto: '', factura: '' })); setPage(1); };
  const previousMonth = () => {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const last = new Date(first.getTime() - 86_400_000).toISOString().slice(0, 10);
    applyRange({ from: `${last.slice(0, 7)}-01`, to: last });
  };
  const filterNavigation = (kind: 'cliente' | 'producto', group: FinancialGroup) => group.id === null ? group.name : <button type="button" className={`${linkClass} text-left`} onClick={() => updateFilter(kind, String(group.id))} aria-label={`Ver detalle de ${group.name}`}>{group.name}</button>;

  if (authLoading) return <LoadingReport />;
  if (!canAccess || !user) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6"><h1 className="text-xl font-semibold text-red-700">Acceso no permitido</h1><p className="mt-2 text-sm text-muted">La información financiera está disponible únicamente para Dirección y Super Admin.</p></div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-foreground">{isAdvisor ? `Rentabilidad por asesora${selectedAdvisor ? ` · ${selectedAdvisor.name}` : ''}` : 'Rentabilidad general'}</h1><p className="mt-1 text-sm text-muted">Facturación publicada en Odoo de todos los canales · Consulta gerencial de solo lectura</p></div>
        <nav aria-label="Navegación financiera" className="flex flex-wrap gap-4 text-sm font-medium">
          {isAdvisor && <Link href={generalHref} className={`${linkClass} inline-flex items-center gap-1`}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Volver a rentabilidad general</Link>}
          <Link href={`/dashboard/comisiones?periodo=${encodeURIComponent(bonusPeriod)}`} className={linkClass}>Liquidaciones del bono plataforma</Link>
        </nav>
      </header>

      <section aria-label="Fechas y filtros del reporte" className="space-y-4 rounded-xl border border-border bg-white p-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (!validationError) applyRange(draftRange); }}>
          <label className="text-sm font-medium text-foreground">
            Desde
            <input type="date" className={inputClass} value={draftRange.from} max={today} required aria-invalid={!!validationError} aria-describedby="financial-range-note financial-error" onChange={(event) => editRange({ ...draftRange, from: event.target.value })} />
          </label>
          <label className="text-sm font-medium text-foreground">
            Hasta
            <input type="date" className={inputClass} value={draftRange.to} max={today} required aria-invalid={!!validationError} aria-describedby="financial-range-note financial-error" onChange={(event) => editRange({ ...draftRange, to: event.target.value })} />
          </label>
          <button type="button" className={buttonClass} onClick={() => applyRange(defaultFinancialRange(today))}>Mes actual</button>
          <button type="button" className={buttonClass} onClick={previousMonth}>Mes anterior</button>
          <button type="submit" className={buttonClass} disabled={loading || !!validationError}>
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {rangePending ? 'Aplicar y consultar' : 'Consultar / actualizar'}
          </button>
        </form>
        <p id="financial-range-note" className="text-xs text-muted">Máximo 366 días, hasta hoy en Bogotá ({today}). Las fechas corresponden a la factura o nota crédito, no a la creación del pedido. Editar fechas no consulta Odoo; aplica el rango o elige un preset.</p>
        {rangePending && <p role="status" className="rounded-lg bg-background-light px-4 py-3 text-sm text-muted">Hay fechas sin aplicar. Las cifras anteriores están ocultas para evitar asociarlas al nuevo rango. Pulsa Aplicar y consultar.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['cliente', 'producto', 'factura'] as const).map((name) => <label key={name} className="text-sm font-medium text-foreground">{{ cliente: 'Cliente', producto: 'Producto', factura: 'Factura / nota crédito' }[name]} · ID Odoo<input type="text" inputMode="numeric" className={inputClass} value={filters[name]} placeholder="Todos" onChange={(event) => updateFilter(name, event.target.value)} aria-describedby="financial-filter-note financial-error" /></label>)}
        </div>
        <p id="financial-filter-note" className="text-xs text-muted">Selecciona un nombre en las tablas para filtrar o introduce un ID Odoo positivo. Producto incluye todas sus unidades, siempre separadas en el resumen.</p>
        {(isAdvisor || filters.cliente || filters.producto || filters.factura) && <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-medium">Filtros activos:</span>{isAdvisor && <span>Asesora: {selectedAdvisor?.name ?? (filters.asesora === 'none' ? 'Sin asesora Odoo' : `ID Odoo ${filters.asesora}`)}</span>}{(['cliente', 'producto', 'factura'] as const).filter((name) => filters[name]).map((name) => <button key={name} type="button" className={buttonClass} onClick={() => updateFilter(name, '')} aria-label={`Quitar filtro ${name} ${filters[name]}`}>{name}: {filters[name]} · Quitar</button>)}{(filters.cliente || filters.producto || filters.factura) && <button type="button" className={buttonClass} onClick={clearDetails}>Limpiar detalle / volver al resumen</button>}</div>}
      </section>

      <aside className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p><strong>Alcance financiero:</strong> ventas netas en COP sin impuestos, con notas crédito descontadas según su signo contable. El costo procede de la factura registrada en Odoo, no del costo actual del catálogo. Los costos faltantes o no verificables dejan la utilidad pendiente.</p>
        <p className="mt-2"><strong>Comisión habitual calculada, no liquidada:</strong> 1% sobre el neto, excepto tóner genéricos de la categoría Odoo 26 (2%), aplicada por línea. No incluye el bono plataforma del 0,5% y aquí no se cierran ni pagan comisiones.</p>
      </aside>
      <div id="financial-error">{(validationError || error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validationError || error}</p>}</div>
      {loading && <LoadingReport />}
      {report && !validationError && <>
        <p className="text-xs text-muted">Consultado: {timestampFormatter.format(new Date(report.generatedAt))} (Bogotá) · {dateLabel(report.range.from)} – {dateLabel(report.range.to)} · Moneda: {report.currency}. Importes en COP con dos decimales. La lectura puede reutilizarse durante un minuto.</p>
        {report.warnings.length > 0 && (
          <details className="rounded-lg border border-border bg-white px-4 py-3 text-sm text-foreground">
            <summary className="cursor-pointer font-medium">Fuente y criterios ({report.warnings.length})</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              {report.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
            </ul>
          </details>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard title="Venta neta sin impuestos" value={currencyFormatter.format(report.totals.netSales)} subtitle={`Facturación: ${currencyFormatter.format(report.totals.invoicedSales)} · Notas crédito (con signo): ${currencyFormatter.format(report.totals.creditNotes)}`} icon={<DollarSign aria-hidden="true" className="h-5 w-5" />} />
          <KpiCard title="Costo registrado en factura" value={money(report.totals.cost)} subtitle={`Cobertura: ${percent(report.totals.costCoveragePercent)} · ${report.totals.missingCostLines} líneas pendientes`} icon={<FileText aria-hidden="true" className="h-5 w-5" />} />
          <KpiCard title="Utilidad del rango" value={money(report.totals.profit)} subtitle={`Margen: ${percent(report.totals.marginPercent)}${report.totals.profit === null ? ' · No hay un total validado' : ''}`} icon={<TrendingUp aria-hidden="true" className="h-5 w-5" />} />
          <KpiCard title="Comisión habitual calculada" value={money(report.totals.commission)} subtitle={`No liquidada · 1% / 2% por línea · ${report.totals.missingCommissionLines} líneas pendientes`} icon={<BadgeDollarSign aria-hidden="true" className="h-5 w-5" />} />
          <KpiCard title="Clientes facturados" value={String(report.totals.clientCount)} subtitle={`${report.totals.invoiceCount} facturas · ${report.totals.creditNoteCount} notas crédito · ${report.totals.lineCount} líneas`} icon={<Building2 aria-hidden="true" className="h-5 w-5" />} />
          <KpiCard title="Factura promedio sin impuestos" value={report.totals.averageInvoice === null ? 'No disponible' : currencyFormatter.format(report.totals.averageInvoice)} subtitle="Promedio de facturas, sin mezclar notas crédito" icon={<FileText aria-hidden="true" className="h-5 w-5" />} />
        </div>
        {(report.totals.cost === null || report.totals.profit === null || report.totals.commission === null) && <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" aria-label="Subtotales verificados, información incompleta"><h2 className="font-semibold">Información incompleta: estos subtotales NO son el total del rango</h2><p className="mt-2">Costo verificado: {currencyFormatter.format(report.totals.knownCost)} · Utilidad verificada: {currencyFormatter.format(report.totals.verifiedProfit)} · Comisión verificada: {currencyFormatter.format(report.totals.knownCommission)}.</p><p className="mt-1">Cobertura del costo: {percent(report.totals.costCoveragePercent)} de las ventas en valor absoluto. Pendientes: {report.totals.missingCostLines} líneas de costo y {report.totals.missingCommissionLines} de comisión. Un valor pendiente no equivale a cero.</p></section>}
        {report.totals.lineCount === 0 && <p className="rounded-xl border border-border bg-white p-6 text-sm text-muted" role="status">Odoo no devolvió líneas facturadas para este rango y filtros. Amplía las fechas o limpia los filtros; no se ha estimado facturación.</p>}
        <Comparison report={report} />
        <GroupTable title="Resumen por asesora" groups={report.advisors} kind="advisor" navigation={(group) => <Link href={advisorHref(group.id)} className={linkClass}>{group.name}</Link>} />
        <GroupTable title="Rentabilidad por cliente" groups={report.clients} kind="client" navigation={(group) => filterNavigation('cliente', group)} />
        <GroupTable title="Productos y unidades" groups={report.products} kind="product" navigation={(group) => filterNavigation('producto', group)} />
        <TrendTable report={report} />
        <section className="overflow-hidden rounded-xl border border-border bg-white" aria-label="Líneas de facturas y notas crédito">
          <div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Detalle de facturas y notas crédito</h2><p className="mt-1 text-xs text-muted">{report.pagination.pageSize} líneas por página desde Odoo. Los KPI y resúmenes incluyen todas las líneas del rango, no solo esta página. Selecciona un documento para consultar sus líneas dentro del rango y filtros.</p></div>
          <div className="overflow-x-auto" role="region" aria-label="Tabla de líneas facturadas" tabIndex={0}>
            <table className="w-full text-sm"><caption className="sr-only">Detalle paginado de líneas Odoo con costo histórico, utilidad y comisión habitual calculada</caption>
              <thead><tr className="border-b border-border bg-background-light/50"><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Documento / fecha</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente / asesora</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Producto / categoría</th><th scope="col" className={headingCellClass}>Cantidad / unidad</th><th scope="col" className={headingCellClass}>Venta neta</th><th scope="col" className={headingCellClass}>Costo de factura</th><th scope="col" className={headingCellClass}>Utilidad</th><th scope="col" className={headingCellClass}>Margen</th><th scope="col" className={headingCellClass}>Tasa habitual</th><th scope="col" className={headingCellClass}>Comisión habitual</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Canal / incidencias</th></tr></thead>
              <tbody>{report.lines.map((line) => <tr key={line.id} className="border-b border-border/50">
                <th scope="row" className="min-w-44 px-4 py-3 text-left align-top font-medium"><button type="button" className={`${linkClass} text-left`} onClick={() => updateFilter('factura', String(line.invoiceId))}>{line.invoiceName}</button><span className="mt-1 block text-xs font-normal text-muted">{dateLabel(line.invoiceDate)} · {line.documentType === 'out_refund' ? 'Nota crédito' : 'Factura'}</span><span className="mt-1 block text-xs font-normal text-muted">{line.companyName} · ID {line.invoiceId} · Línea {line.id}</span></th>
                <td className="min-w-44 px-4 py-3 align-top">{line.clientId === null ? line.clientName : <button type="button" className={`${linkClass} text-left`} onClick={() => updateFilter('cliente', String(line.clientId))}>{line.clientName}</button>}<Link className={`${linkClass} mt-2 block text-xs`} href={advisorHref(line.advisorId)}>{line.advisorName}</Link></td>
                <td className="min-w-52 px-4 py-3 align-top">{line.productId === null ? line.productName : <button type="button" className={`${linkClass} text-left`} onClick={() => updateFilter('producto', String(line.productId))}>{line.productName}</button>}<span className="mt-1 block text-xs text-muted">SKU: {line.sku ?? 'No disponible'} · {line.categoryName ?? 'Categoría pendiente'}{line.categoryId !== null ? ` (ID ${line.categoryId})` : ''}</span></td>
                <td className={cellClass}>{quantityFormatter.format(line.quantity)} {line.unitName}</td><AmountCell value={line.netSales} /><AmountCell value={line.cost} /><AmountCell value={line.profit} /><td className={cellClass}>{percent(line.marginPercent)}</td><td className={cellClass}>{line.commissionRate === null ? 'Pendiente' : percent(line.commissionRate)}</td><AmountCell value={line.commission} />
                <td className="min-w-52 px-4 py-3 align-top text-xs"><span>{{ portal: 'Portal', mixed: 'Mixto', other: 'Otros / sin vínculo al portal' }[line.channel]}</span>{line.issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-800">{line.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {report.lines.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Sin líneas para esta consulta.</p>}
          <Pagination label="líneas facturadas" page={report.pagination.page} totalPages={report.pagination.totalPages} total={report.pagination.total} onChange={setPage} />
        </section>
        {isAdvisor && <AdvisorBonus portalAdvisorId={requestedFilters.advisorId === null ? null : selectedAdvisor?.portalAdvisorId ?? null} period={bonusPeriod} onPeriodChange={onBonusPeriodChange} today={today} userId={user.id} />}
      </>}
    </div>
  );
}

function FinancialLocation(props: GerenciaFinanzasProps) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [bonusPeriod, setBonusPeriod] = useState(() => {
    const currentPeriod = getBogotaCalendarDate().slice(0, 7);
    const requested = new URLSearchParams(query).get('desde')?.slice(0, 7);
    return requested && requested >= PLATFORM_BONUS_START_DATE.slice(0, 7) && requested <= currentPeriod ? requested : currentPeriod;
  });
  return <FinancialView key={`${props.advisorId === undefined ? 'all' : props.advisorId ?? 'none'}:${query}`} {...props} initialQuery={query} bonusPeriod={bonusPeriod} onBonusPeriodChange={setBonusPeriod} />;
}

export default function GerenciaFinanzas(props: GerenciaFinanzasProps) {
  return <Suspense fallback={<LoadingReport />}><FinancialLocation {...props} /></Suspense>;
}
