'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeDollarSign, ChevronRight, ClipboardList, Clock, FilePen, Loader2, Package, Percent, RefreshCw, TrendingUp,
} from 'lucide-react';
import PedidosPorFacturar from '@/components/dashboards/PedidosPorFacturar';
import { buildPeriodKpis, percentChange, type ExecutiveSummary, type KpiPeriod, type PeriodKpi } from '@/lib/gerencia/resumen';
import type { OpenBalanceReport } from '@/lib/gerencia/cartera';
import {
  formatDateTimeBogota, formatMoney, formatMoneyShort, formatMonthLong, formatMonthShort, formatPercent, shortPersonName, toDisplayName,
} from '@/lib/gerencia/formato';
import { cn } from '@/lib/utils';

type Loaded<T> = { key: number; data: T | null; error: string | null };
const card = 'rounded-2xl border border-border bg-white';
const PERIODS: { value: KpiPeriod; label: string; short: string }[] = [
  { value: 'mes', label: 'Mes en curso', short: 'Mes' },
  { value: 'mes_anterior', label: 'Mes anterior', short: 'Mes ant.' },
  { value: 'anio', label: 'Año a la fecha', short: 'Año' },
];

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? 'No se pudo consultar Odoo.');
  return payload as T;
}

function Chip({ value, suffix, neutral }: { value?: number | null; suffix: string; neutral?: boolean }) {
  if (neutral || value === undefined) return <span className="inline-flex items-center rounded-md bg-background-light px-2 py-1 text-xs font-medium text-foreground">{suffix}</span>;
  if (value === null) return <span className="inline-flex items-center rounded-md bg-background-light px-2 py-1 text-xs text-muted">Sin base {suffix}</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium tabular-nums', up ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
      <Icon className="h-3 w-3" aria-hidden="true" /><span className="sr-only">{up ? 'Sube' : 'Baja'} </span>{formatPercent(Math.abs(value))} {suffix}
    </span>
  );
}

function Kpi({ title, value, icon, children }: { title: string; value: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className={cn(card, 'w-[85%] shrink-0 snap-start p-5 md:w-auto')}>
      <div className="flex items-start justify-between gap-3"><h3 className="text-sm text-muted">{title}</h3><span className="text-primary">{icon}</span></div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </article>
  );
}

function kpiTitle(kpi: PeriodKpi, summary: ExecutiveSummary): string {
  if (kpi.period === 'mes') {
    const { from, to } = summary.currentPeriod.range;
    return `${Number(from.slice(8))}–${Number(to.slice(8))} ${formatMonthShort(from.slice(0, 7))}`;
  }
  if (kpi.period === 'mes_anterior') return formatMonthLong(summary.months[1].month);
  return `${summary.asOfDate.slice(0, 4)} a la fecha`;
}

export default function ResumenEjecutivo() {
  const [refresh, setRefresh] = useState(0);
  const [period, setPeriod] = useState<KpiPeriod>('mes');
  const [slide, setSlide] = useState(0);
  const carousel = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<Loaded<ExecutiveSummary> | null>(null);
  const [cartera, setCartera] = useState<Loaded<OpenBalanceReport> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<ExecutiveSummary>('/api/gerencia/resumen', controller.signal)
      .then(data => setSummary({ key: refresh, data, error: null }))
      .catch(error => { if (!controller.signal.aborted) setSummary({ key: refresh, data: null, error: error.message }); });
    fetchJson<OpenBalanceReport>(`/api/gerencia/cartera?${new URLSearchParams({ tipo: 'cobrar', estado: 'all', buscar: '', pagina: '1' })}`, controller.signal)
      .then(data => setCartera({ key: refresh, data, error: null }))
      .catch(error => { if (!controller.signal.aborted) setCartera({ key: refresh, data: null, error: error.message }); });
    return () => controller.abort();
  }, [refresh]);

  const current = summary?.key === refresh ? summary : null;
  const balances = cartera?.key === refresh ? cartera.data : null;
  const carteraError = cartera?.key === refresh ? cartera.error : null;
  const data = current?.data;
  const year = data?.asOfDate.slice(0, 4);
  const kpis = data ? buildPeriodKpis(data.months, month => formatMonthShort(month, year)) : [];
  const kpi = kpis.find(entry => entry.period === period);

  const onCarouselScroll = () => {
    const element = carousel.current;
    const first = element?.firstElementChild as HTMLElement | null;
    if (element && first) setSlide(Math.round(element.scrollLeft / (first.offsetWidth + 16)));
  };

  const zeroCost = data ? (data.zeroCostGoods.current.lineCount > 0 ? data.zeroCostGoods.current : data.zeroCostGoods.previousMonth) : null;
  const attention = data ? [
    data.drafts.count > 0 && {
      key: 'borradores', href: '/dashboard/por-facturar#borradores', icon: <FilePen className="h-4 w-4" aria-hidden="true" />, tone: 'bg-amber-50 text-amber-700',
      title: `${data.drafts.count} ${data.drafts.count === 1 ? 'factura' : 'facturas'} en borrador`,
      detail: `${data.drafts.invoices} ${data.drafts.invoices === 1 ? 'factura' : 'facturas'} y ${data.drafts.creditNotes} ${data.drafts.creditNotes === 1 ? 'nota crédito' : 'notas crédito'} sin publicar en Odoo; no cuentan en ventas.`,
      amount: data.drafts.untaxed,
    },
    data.toInvoice.stale.count > 0 && {
      key: 'antiguos', href: '/dashboard/por-facturar?filtro=antiguos', icon: <Clock className="h-4 w-4" aria-hidden="true" />, tone: 'bg-amber-50 text-amber-700',
      title: `${data.toInvoice.stale.count} pedidos sin facturar hace más de ${data.toInvoice.stale.days} días`,
      detail: data.toInvoice.stale.orderNames.join(' · '), amount: data.toInvoice.stale.amount,
    },
    balances?.receivableOver90 && balances.receivableOver90.amount > 0 && {
      key: 'vencida', href: '/dashboard/cartera', icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, tone: 'bg-red-50 text-red-600',
      title: 'Cartera vencida a más de 90 días',
      detail: `${balances.receivableOver90.documentCount} facturas de ${balances.receivableOver90.partnerCount} clientes.`, amount: balances.receivableOver90.amount,
    },
    zeroCost && zeroCost.lineCount > 0 && {
      key: 'costo-cero', href: `/dashboard/gerencia?desde=${zeroCost.range.from}&hasta=${zeroCost.range.to}`, icon: <Package className="h-4 w-4" aria-hidden="true" />, tone: 'bg-background-light text-muted',
      title: `${zeroCost.lineCount} ${zeroCost.lineCount === 1 ? 'línea' : 'líneas'} de mercancía con costo cero`,
      detail: `Inflan la utilidad de ${formatMonthLong(zeroCost.range.from.slice(0, 7)).split(' ')[0]}; revisar costo en Odoo.`, amount: zeroCost.sales,
    },
  ].filter((entry): entry is Exclude<typeof entry, false | null | undefined | 0> => Boolean(entry)) : [];

  const months = data ? [...data.months].reverse() : [];
  const maxSales = Math.max(1, ...months.map(row => row.sales));
  const aging = balances ? [
    { label: 'No vencido', amount: balances.receivable.notDue, color: 'bg-primary' },
    ...balances.receivable.aging.map((bucket, index) => ({
      label: bucket.label.replace(' días', '').replace('Más de 90', '> 90'), amount: bucket.amount,
      color: ['bg-primary/40', 'bg-amber-500', 'bg-orange-600', 'bg-red-500'][index] ?? 'bg-red-500',
    })),
  ] : [];
  const agingTotal = aging.reduce((sum, bucket) => sum + Math.max(0, bucket.amount), 0);
  const advisors = data ? data.toInvoice.byAdvisor.filter(row => row.amount > 0) : [];
  const maxAdvisor = Math.max(1, ...advisors.map(row => row.amount));

  return (
    <section aria-labelledby="resumen-ejecutivo" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="resumen-ejecutivo" className="text-2xl font-semibold tracking-tight text-foreground">Resumen ejecutivo</h1>
          <p className="mt-1 text-sm text-muted">{data ? `${data.company.name} · Odoo, actualizado ${formatDateTimeBogota(data.generatedAt)}` : 'Ventas, utilidad, cartera y facturación pendiente.'}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div role="group" aria-label="Período" className="flex flex-1 rounded-xl border border-border bg-white p-1 sm:flex-none">
            {PERIODS.map(option => (
              <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)}
                className={cn('min-h-9 flex-1 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-none',
                  period === option.value ? 'bg-foreground text-white' : 'text-muted hover:text-foreground')}>
                <span className="sm:hidden">{option.short}</span><span className="hidden sm:inline">{option.label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setRefresh(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Actualizar</span><span className="sr-only sm:hidden">Actualizar</span>
          </button>
        </div>
      </div>

      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando Odoo…</p>}
      {current?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}

      {data && kpi && <>
        <div>
          <h2 className="sr-only">Indicadores · {PERIODS.find(option => option.value === period)?.label}</h2>
          <div ref={carousel} onScroll={onCarouselScroll} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:scroll-px-0 md:px-0 xl:grid-cols-4">
            <Kpi title={`Ventas · ${kpiTitle(kpi, data)}`} value={formatMoneyShort(kpi.totals.sales)} icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}>
              {kpi.comparisons.map(comparison => <Chip key={comparison.label} value={percentChange(kpi.totals.sales, comparison.totals.sales)} suffix={`vs ${comparison.label}`} />)}
            </Kpi>
            <Kpi title="Utilidad bruta" value={formatMoneyShort(kpi.totals.profit)} icon={<BadgeDollarSign className="h-5 w-5" aria-hidden="true" />}>
              {kpi.comparisons.map(comparison => <Chip key={comparison.label} value={percentChange(kpi.totals.profit, comparison.totals.profit)} suffix={`vs ${comparison.label}`} />)}
            </Kpi>
            <Kpi title="Margen bruto" value={formatPercent(kpi.marginPercent)} icon={<Percent className="h-5 w-5" aria-hidden="true" />}>
              {(() => {
                const [first, second] = kpi.comparisons;
                const firstMargin = first && first.totals.sales > 0 ? first.totals.profit / first.totals.sales * 100 : null;
                const secondMargin = second && second.totals.sales > 0 ? second.totals.profit / second.totals.sales * 100 : null;
                return <>
                  {first && <Chip value={kpi.marginPercent !== null && firstMargin !== null ? Math.round((kpi.marginPercent - firstMargin) * 10) / 10 : null} suffix={`pts vs ${first.label}`} />}
                  {second && <Chip neutral suffix={`${second.label.charAt(0).toUpperCase()}${second.label.slice(1)}: ${formatPercent(secondMargin === null ? null : Math.round(secondMargin * 10) / 10)}`} />}
                </>;
              })()}
            </Kpi>
            <Kpi title="Pendiente por facturar" value={formatMoneyShort(data.toInvoice.untaxed)} icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}>
              <Chip neutral suffix={`${data.toInvoice.orderCount} pedidos`} />
              {data.drafts.untaxed !== 0 && <Chip neutral suffix={`+ ${formatMoneyShort(data.drafts.untaxed)} en borrador`} />}
            </Kpi>
          </div>
          <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
            {[0, 1, 2, 3].map(index => <span key={index} className={cn('h-1.5 rounded-full transition-all', index === slide ? 'w-5 bg-primary' : 'w-1.5 bg-border')} />)}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <figure className={cn(card, 'order-2 p-5 lg:order-1 lg:col-span-2')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <figcaption className="font-semibold"><span className="hidden sm:inline">Ventas y margen · últimos 12 meses</span><span className="sm:hidden">Ventas · 6 meses</span></figcaption>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />Ventas sin IVA</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/30" aria-hidden="true" />Mes en curso ({Number(data.currentPeriod.range.from.slice(8))}–{Number(data.currentPeriod.range.to.slice(8))})</span>
              </div>
            </div>
            <ol className="mt-6 flex h-56 items-end gap-2 sm:gap-3">
              {months.map((row, index) => {
                const label = `${formatMonthLong(row.month)}${row.partial ? ' (en curso)' : ''}: ventas ${formatMoney(row.sales)}, utilidad ${formatMoney(row.profit)}, margen ${formatPercent(row.marginPercent)}`;
                return (
                  <li key={row.month} className={cn('group relative h-full flex-1 flex-col items-center justify-end', index < months.length - 6 ? 'hidden sm:flex' : 'flex')}>
                    <span className="mb-1 text-[11px] text-muted tabular-nums">{row.marginPercent === null ? '—' : `${Math.round(row.marginPercent)}%`}</span>
                    <div tabIndex={0} aria-label={label}
                      className={cn('w-full rounded-t-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground', row.partial ? 'bg-primary/30' : 'bg-primary group-hover:bg-primary-dark group-focus-within:bg-primary-dark')}
                      style={{ height: `${Math.max(2, Math.round(row.sales / maxSales * 100))}%` }} />
                    <span className={cn('mt-2 text-xs capitalize', row.partial ? 'font-semibold text-[#5c7004]' : 'text-muted')}>{formatMonthShort(row.month)}</span>
                    <div role="presentation" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-within:block">
                      <p className="font-semibold capitalize">{formatMonthLong(row.month)}{row.partial ? ' · en curso' : ''}</p>
                      <p>Ventas {formatMoneyShort(row.sales)}</p>
                      <p>Utilidad {formatMoneyShort(row.profit)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 text-xs text-muted">Cifra sobre cada barra: margen bruto. Pasa el cursor o enfoca una barra para ver ventas y utilidad.</p>
          </figure>

          <section aria-labelledby="requiere-atencion" className={cn(card, 'order-1 lg:order-2')}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="requiere-atencion" className="font-semibold">Requiere atención</h2>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">{attention.length}</span>
            </div>
            <ul>
              {attention.map(item => (
                <li key={item.key} className="border-b border-border last:border-0">
                  <Link href={item.href} className="flex gap-3 px-5 py-4 hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', item.tone)}>{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{item.title}</span>
                      {item.detail && <span className="mt-0.5 hidden text-xs text-muted sm:block">{item.detail}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoneyShort(item.amount)}</span>
                    <span className="flex shrink-0 items-center gap-0.5 self-center text-xs font-medium text-muted" aria-hidden="true">Ver<ChevronRight className="h-4 w-4" /></span>
                  </Link>
                </li>
              ))}
              {attention.length === 0 && <li className="px-5 py-6 text-sm text-muted">Nada pendiente por revisar.</li>}
            </ul>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="cartera-hoy" className={cn(card, 'p-5')}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="cartera-hoy" className="font-semibold">Cartera hoy</h2>
              <Link href="/dashboard/cartera" className="text-sm font-medium text-[#5c7004] underline underline-offset-4">Ver detalle</Link>
            </div>
            {!balances && <p className="mt-4 text-sm text-muted" role={carteraError ? 'alert' : 'status'}>{carteraError ?? 'Consultando cartera…'}</p>}
            {balances?.invoices && <>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div><dt className="text-sm text-muted">Por cobrar · {balances.invoices.receivable.documentCount} facturas</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{formatMoneyShort(balances.invoices.receivable.total)}</dd></div>
                <div><dt className="text-sm text-muted">Por pagar · {balances.invoices.payable.documentCount} facturas</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{formatMoneyShort(balances.invoices.payable.total)}</dd></div>
              </dl>
              <p className="mt-5 text-sm text-muted">Antigüedad por cobrar</p>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-background-light" aria-hidden="true">
                {aging.map(bucket => <span key={bucket.label} className={bucket.color} style={{ width: `${agingTotal > 0 ? Math.max(0, bucket.amount) / agingTotal * 100 : 0}%` }} />)}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
                {aging.map(bucket => (
                  <div key={bucket.label}>
                    <dt className="flex items-center gap-1.5 text-xs text-muted"><span className={cn('h-2 w-2 rounded-sm', bucket.color)} aria-hidden="true" />{bucket.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoneyShort(bucket.amount)}</dd>
                  </div>
                ))}
              </dl>
            </>}
          </section>

          <section aria-labelledby="por-asesora" className={cn(card, 'p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="por-asesora" className="font-semibold">Por facturar por asesora</h2>
              <p className="text-sm text-muted">{formatMoneyShort(data.toInvoice.untaxed)} · {data.toInvoice.orderCount} pedidos</p>
            </div>
            <ul className="mt-4 space-y-3">
              {advisors.map(row => (
                <li key={row.advisorId ?? 'none'} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 text-sm">
                  <span className="truncate" title={toDisplayName(row.advisorName)}>{shortPersonName(row.advisorName)}</span>
                  <span className="h-2 rounded-full bg-background-light" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(row.amount / maxAdvisor * 100)}%` }} /></span>
                  <span className="font-semibold tabular-nums">{formatMoneyShort(row.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="pedidos-saldo" className={cn(card, 'overflow-hidden')}>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 id="pedidos-saldo" className="font-semibold">Pedidos con más saldo por facturar</h2>
            <Link href="/dashboard/por-facturar" className="text-sm font-medium text-[#5c7004] underline underline-offset-4">Ver los {data.toInvoice.orderCount} pedidos</Link>
          </div>
          <div className="px-4 pb-4 md:px-0 md:pb-0"><PedidosPorFacturar orders={data.toInvoice.orders} limit={5} /></div>
        </section>

        <details className={cn(card, 'hidden md:block')}>
          <summary className="cursor-pointer px-5 py-4 font-semibold">Mes a mes · tabla completa (12 meses)</summary>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Ventas, utilidad y margen de los últimos 12 meses, con variaciones contra el mes anterior y el mismo mes del año anterior</caption>
              <thead className="bg-background-light text-muted">
                <tr>{['Mes', 'Ventas', 'Utilidad bruta', 'Margen', 'Ventas vs mes ant.', 'Ventas vs año ant.', 'Utilidad vs mes ant.', 'Utilidad vs año ant.'].map((heading, index) => (
                  <th key={heading} scope="col" className={cn('px-4 py-3 font-medium', index === 0 ? 'text-left' : 'text-right')}>{heading}</th>
                ))}</tr>
              </thead>
              <tbody>{data.months.map(row => (
                <tr key={row.month} className={cn('border-t border-border', row.partial && 'bg-primary/5')}>
                  <th scope="row" className="px-4 py-3 text-left font-medium capitalize">{formatMonthLong(row.month)}{row.partial && <span className="block text-xs font-normal normal-case text-muted">En curso: compara el mismo período</span>}</th>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.sales)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.profit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPercent(row.marginPercent)}</td>
                  {[row.salesVsPreviousMonth, row.salesVsPreviousYear, row.profitVsPreviousMonth, row.profitVsPreviousYear].map((value, index) => (
                    <td key={index} className={cn('px-4 py-3 text-right tabular-nums', value === null ? 'text-muted' : value >= 0 ? 'text-emerald-700' : 'text-red-700')}>{value === null ? '—' : `${value > 0 ? '+' : ''}${formatPercent(value)}`}</td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>

        <div className="space-y-1">{data.warnings.map(warning => <p key={warning} className="text-xs text-muted">{warning}</p>)}</div>
      </>}
    </section>
  );
}
