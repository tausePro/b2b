'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BadgeDollarSign, ClipboardList, FilePen, FileText, Loader2, Percent, RefreshCw, TrendingUp, Wallet } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import { marginPercent, type ExecutiveSummary } from '@/lib/gerencia/resumen';
import type { OpenBalanceReport } from '@/lib/gerencia/cartera';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });
const formatMonth = (month: string) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
const formatDay = (date: string) => dayFormatter.format(new Date(`${date}T00:00:00Z`));
const formatDate = (date: string | null) => (date ? dateFormatter.format(new Date(`${date}T00:00:00Z`)) : '—');
const formatPercent = (value: number | null) => (value === null ? '—' : `${pct.format(value)}%`);
const changeText = (value: number | null) => (value === null ? 'sin base' : `${value > 0 ? '+' : ''}${pct.format(value)}%`);
const cell = 'px-4 py-3 text-right tabular-nums align-top';
const heading = 'px-4 py-3 text-right font-medium text-muted';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

type Loaded<T> = { key: number; data: T | null; error: string | null };

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return <span className={value >= 0 ? 'text-emerald-700' : 'text-danger'}>{value > 0 ? '+' : ''}{pct.format(value)}%</span>;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? 'No se pudo consultar Odoo.');
  return payload as T;
}

/** Gerencia: resumen ejecutivo completo. Cartera: foto de la empresa sin costos, utilidad ni márgenes. */
export default function ResumenEjecutivo({ variant = 'gerencia' }: { variant?: 'gerencia' | 'cartera' }) {
  const [refresh, setRefresh] = useState(0);
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
  const balances = cartera?.key === refresh ? cartera : null;
  const data = current?.data;
  const salesOnly = variant === 'cartera' || data?.scope === 'sales';
  const month = data?.months[0];
  const maxSales = data ? Math.max(1, ...data.months.map(row => row.sales)) : 1;
  const receivable = balances?.data?.receivable;
  const pending = balances?.error ? 'No disponible' : '…';

  return (
    <section aria-labelledby="resumen-ejecutivo" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="resumen-ejecutivo" className="text-2xl font-bold text-foreground">{salesOnly ? 'Cómo va la empresa' : 'Resumen ejecutivo'}</h1>
          <p className="mt-1 text-sm text-muted">{data ? `${data.company.name} · datos de Odoo al ${formatDate(data.asOfDate)}` : salesOnly ? 'Facturación, cartera y facturación pendiente en una sola vista.' : 'Ventas, utilidad, cartera y facturación pendiente en una sola vista.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {salesOnly && <Link href="/dashboard/cartera" className={button}>Ver detalle de cartera<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
          <button type="button" className={button} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar</button>
        </div>
      </div>

      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando Odoo…</p>}
      {current?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}

      {data && month && <>
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Mes en curso · {formatMonth(month.month)} (del {formatDay(data.currentPeriod.range.from)} al {formatDay(data.currentPeriod.range.to)})</h2>
          <div className={`grid grid-cols-1 gap-4 ${salesOnly ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
            <KpiCard title={salesOnly ? 'Facturación del mes (sin IVA)' : 'Ventas del mes (sin IVA)'} value={money.format(month.sales)} subtitle={`vs mes anterior ${changeText(month.salesVsPreviousMonth)} · vs año anterior ${changeText(month.salesVsPreviousYear)} · ${month.documents} documentos`} icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />} />
            {salesOnly
              ? <KpiCard title="Facturas y notas crédito del mes" value={String(month.documents)} subtitle={`Mismo período mes anterior: ${month.previousMonth.documents} · año anterior: ${month.previousYear.documents}`} icon={<FileText className="h-5 w-5" aria-hidden="true" />} />
              : <>
                <KpiCard title="Utilidad bruta del mes" value={money.format(month.profit)} subtitle={`vs mes anterior ${changeText(month.profitVsPreviousMonth)} · vs año anterior ${changeText(month.profitVsPreviousYear)}`} icon={<BadgeDollarSign className="h-5 w-5" aria-hidden="true" />} />
                <KpiCard title="Margen bruto del mes" value={formatPercent(month.marginPercent)} subtitle={`Mismo período mes anterior: ${formatPercent(marginPercent(month.previousMonth))} · año anterior: ${formatPercent(marginPercent(month.previousYear))}`} icon={<Percent className="h-5 w-5" aria-hidden="true" />} />
              </>}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Cartera y facturación pendiente · hoy</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Por cobrar (facturas pendientes)" value={balances?.data?.invoices ? money.format(balances.data.invoices.receivable.total) : pending} subtitle={balances?.data?.invoices ? `${balances.data.invoices.receivable.documentCount} facturas, como el tablero de Odoo` : balances?.error ?? 'Consultando cartera…'} icon={<Wallet className="h-5 w-5" aria-hidden="true" />} />
            {salesOnly
              ? <KpiCard title="Cartera vencida" value={receivable ? money.format(receivable.overdue) : pending} subtitle={receivable ? 'Cargos con fecha de vencimiento cumplida, sin compensar abonos' : 'Consultando cartera…'} icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />} />
              : <KpiCard title="Por pagar (facturas pendientes)" value={balances?.data?.invoices ? money.format(balances.data.invoices.payable.total) : pending} subtitle={balances?.data?.invoices ? `${balances.data.invoices.payable.documentCount} facturas de proveedor` : 'Consultando cartera…'} icon={<Wallet className="h-5 w-5" aria-hidden="true" />} />}
            <KpiCard title="Pendiente por facturar (sin IVA)" value={money.format(data.toInvoice.untaxed)} subtitle={`${data.toInvoice.orderCount} pedidos confirmados por facturar`} icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />} />
            <KpiCard title="Facturas en borrador (sin IVA)" value={money.format(data.drafts.untaxed)} subtitle={`${data.drafts.invoices} facturas y ${data.drafts.creditNotes} notas crédito sin publicar`} icon={<FilePen className="h-5 w-5" aria-hidden="true" />} />
          </div>
        </div>

        {salesOnly && receivable && (
          <div className="overflow-x-auto rounded-xl border border-border bg-white" role="region" aria-labelledby="resumen-antiguedad" tabIndex={0}>
            <table className="w-full text-sm">
              <caption id="resumen-antiguedad" className="px-4 py-3 text-left font-semibold">Antigüedad de la cartera vencida · {money.format(receivable.overdue)}</caption>
              <thead className="bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Días vencidos</th><th scope="col" className={heading}>Valor</th><th scope="col" className={heading}>Participación</th></tr></thead>
              <tbody>{receivable.aging.map(bucket => (
                <tr key={bucket.label} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{bucket.label}</th><td className={cell}>{money.format(bucket.amount)}</td><td className={cell}>{receivable.overdue > 0 ? `${pct.format(bucket.amount / receivable.overdue * 100)}%` : '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        <div className="overflow-auto rounded-xl border border-border bg-white" role="region" aria-labelledby="resumen-mes-a-mes" tabIndex={0} style={{ maxBlockSize: 'min(720px, 80vh)' }}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption id="resumen-mes-a-mes" className="px-4 py-3 text-left font-semibold">{salesOnly ? 'Facturación mes a mes' : 'Mes a mes'} · últimos 12 meses (sin IVA, notas crédito descontadas)</caption>
            <thead className="sticky top-0 z-10 bg-background-light">
              {salesOnly
                ? <tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Mes</th><th scope="col" className={heading}>Facturación</th><th scope="col" className={heading}>vs mes anterior</th><th scope="col" className={heading}>vs año anterior</th><th scope="col" className={heading}>Documentos</th></tr>
                : <tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Mes</th><th scope="col" className={heading}>Ventas</th><th scope="col" className={heading}>Utilidad bruta</th><th scope="col" className={heading}>Margen</th><th scope="col" className={heading}>Ventas vs mes anterior</th><th scope="col" className={heading}>Ventas vs año anterior</th><th scope="col" className={heading}>Utilidad vs mes anterior</th><th scope="col" className={heading}>Utilidad vs año anterior</th></tr>}
            </thead>
            <tbody>{data.months.map(row => (
              <tr key={row.month} className={row.partial ? 'bg-primary/5' : undefined}>
                <th scope="row" className="border-t border-border px-4 py-3 text-left align-top font-medium capitalize">{formatMonth(row.month)}{row.partial && <span className="mt-1 block text-xs font-normal normal-case text-muted">En curso: compara el mismo período</span>}</th>
                <td className={`${cell} border-t border-border`}>{money.format(row.sales)}<span className="mt-1 block h-1.5 rounded-full bg-primary/70" style={{ inlineSize: `${Math.max(0, Math.round(row.sales / maxSales * 100))}%`, marginInlineStart: 'auto' }} aria-hidden="true" /></td>
                {salesOnly ? <>
                  <td className={`${cell} border-t border-border`}><Change value={row.salesVsPreviousMonth} /></td>
                  <td className={`${cell} border-t border-border`}><Change value={row.salesVsPreviousYear} /></td>
                  <td className={`${cell} border-t border-border`}>{row.documents}</td>
                </> : <>
                  <td className={`${cell} border-t border-border`}>{money.format(row.profit)}</td>
                  <td className={`${cell} border-t border-border`}>{formatPercent(row.marginPercent)}</td>
                  <td className={`${cell} border-t border-border`}><Change value={row.salesVsPreviousMonth} /></td>
                  <td className={`${cell} border-t border-border`}><Change value={row.salesVsPreviousYear} /></td>
                  <td className={`${cell} border-t border-border`}><Change value={row.profitVsPreviousMonth} /></td>
                  <td className={`${cell} border-t border-border`}><Change value={row.profitVsPreviousYear} /></td>
                </>}
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-white xl:col-span-2" role="region" aria-labelledby="resumen-por-facturar" tabIndex={0}>
            <table className="w-full text-sm">
              <caption id="resumen-por-facturar" className="px-4 py-3 text-left font-semibold">Pedidos con más saldo por facturar · {money.format(data.toInvoice.untaxed)} en {data.toInvoice.orderCount} pedidos</caption>
              <thead className="bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Pedido</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Asesora</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Fecha</th><th scope="col" className={heading}>Saldo sin IVA</th></tr></thead>
              <tbody>{data.toInvoice.orders.map(order => (
                <tr key={order.id} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{order.name}</th><td className="px-4 py-3">{order.partnerName}</td><td className="px-4 py-3">{order.advisorName ?? '—'}</td><td className="px-4 py-3">{formatDate(order.date)}</td><td className={cell}>{money.format(order.amountToInvoice)}</td></tr>
              ))}</tbody>
            </table>
            {data.toInvoice.orders.length === 0 && <p className="px-4 pb-4 text-sm text-muted">No hay pedidos pendientes por facturar.</p>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-white" role="region" aria-labelledby="resumen-por-asesora" tabIndex={0}>
            <table className="w-full text-sm">
              <caption id="resumen-por-asesora" className="px-4 py-3 text-left font-semibold">Por facturar por asesora</caption>
              <tbody>{data.toInvoice.byAdvisor.filter(row => row.amount !== 0).map(row => (
                <tr key={row.advisorId ?? 'none'} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{row.advisorName}</th><td className={cell}>{money.format(row.amount)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-white" role="region" aria-labelledby="resumen-borradores" tabIndex={0}>
          <table className="w-full text-sm">
            <caption id="resumen-borradores" className="px-4 py-3 text-left font-semibold">Facturas en borrador · {data.drafts.count} documentos sin publicar ({money.format(data.drafts.untaxed)} sin IVA)</caption>
            <thead className="bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Documento</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Asesora</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Fecha</th><th scope="col" className={heading}>Valor sin IVA</th></tr></thead>
            <tbody>{data.drafts.items.map(draft => (
              <tr key={draft.id} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{draft.name}<span className="mt-1 block text-xs font-normal text-muted">{draft.documentType === 'out_refund' ? 'Nota crédito' : 'Factura'}</span></th><td className="px-4 py-3">{draft.partnerName}</td><td className="px-4 py-3">{draft.advisorName ?? '—'}</td><td className="px-4 py-3">{formatDate(draft.date)}</td><td className={cell}>{money.format(draft.untaxed)}</td></tr>
            ))}</tbody>
          </table>
          {data.drafts.items.length === 0 && <p className="px-4 pb-4 text-sm text-muted">No hay facturas en borrador.</p>}
        </div>

        <div className="space-y-1">{data.warnings.filter(warning => !salesOnly || !/utilidad/i.test(warning)).map(warning => <p key={warning} className="text-xs text-muted">{warning}</p>)}</div>
      </>}
    </section>
  );
}
