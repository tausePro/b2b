'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, Download, Loader2, Receipt, Users } from 'lucide-react';
import {
  LIQUIDATION_STATUS_LABELS, PLATFORM_FEE_HIGH, PLATFORM_FEE_LOW, PLATFORM_FEE_THRESHOLD, PLATFORM_GRACE_MONTHS, buildLiquidationCsv,
  type LiquidationClient, type LiquidationSummary,
} from '@/lib/plataforma/liquidacion';
import { cn, formatCOP } from '@/lib/utils';

interface Report {
  month: string;
  currentMonth: string;
  preliminary: boolean;
  clients: LiquidationClient[];
  summary: LiquidationSummary;
  warnings: string[];
}

const card = 'rounded-2xl border border-border bg-white p-5';
const STATUS_TONE = { pidio: 'bg-emerald-50 text-emerald-800', gracia: 'bg-amber-50 text-amber-800', no_paga: 'bg-background-light text-muted' } as const;
const monthLabel = (month: string) => new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));

function statusDetail(client: LiquidationClient) {
  if (client.status === 'pidio') return `${client.ordersInMonth} ${client.ordersInMonth === 1 ? 'pedido' : 'pedidos'} en el mes`;
  if (client.status === 'gracia') return `${client.monthsWithoutOrders} de ${PLATFORM_GRACE_MONTHS} meses sin pedir`;
  return `${client.monthsWithoutOrders} meses seguidos sin pedir`;
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Liquidación mensual de la plataforma: lo que Imprima paga por cliente según el acuerdo. */
export default function LiquidacionPlataforma() {
  const [month, setMonth] = useState<string | null>(null);
  const [state, setState] = useState<{ key: string; report: Report | null; error: string | null } | null>(null);
  const key = month ?? 'predeterminado';

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/plataforma/liquidacion${month ? `?mes=${month}` : ''}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? 'No se pudo calcular la liquidación.');
        setState({ key, report: data, error: null });
      })
      .catch((error) => { if (!controller.signal.aborted) setState({ key, report: null, error: error instanceof Error ? error.message : 'No se pudo calcular la liquidación.' }); });
    return () => controller.abort();
  }, [key, month]);

  const current = state?.key === key ? state : null;
  const report = current?.report ?? null;
  const shownMonth = month ?? report?.month ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Liquidación de plataforma</h1>
          <p className="mt-1 text-sm text-muted">Clientes de la plataforma y valor a facturar a Imprima por mes calendario.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">Mes
            <input type="month" min="2026-01" max={report?.currentMonth} value={shownMonth} onChange={(event) => event.target.value && setMonth(event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-border bg-white px-3 text-sm" />
          </label>
          <button type="button" disabled={!report || report.clients.length === 0} onClick={() => report && download(`liquidacion-plataforma-${report.month}.csv`, buildLiquidationCsv(report.month, report.clients))}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-background-light disabled:opacity-50">
            <Download className="h-4 w-4" aria-hidden="true" />Exportar CSV
          </button>
        </div>
      </div>

      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Calculando con Odoo…</p>}
      {current?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}

      {report && <>
        <p className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium', report.preliminary ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800')}>
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          {report.preliminary ? `${monthLabel(report.month)} en curso: cifras preliminares` : `${monthLabel(report.month)} cerrado: listo para facturar`}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <article className={card}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Total a facturar a Imprima</h2><Receipt className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatCOP(report.summary.totalFee)}</p>
            <p className="mt-2 text-xs text-muted">{report.summary.highFee} × {formatCOP(PLATFORM_FEE_HIGH)} · {report.summary.lowFee} × {formatCOP(PLATFORM_FEE_LOW)}</p>
          </article>
          <article className={card}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Clientes de plataforma</h2><Users className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{report.summary.clients}</p>
            <p className="mt-2 text-xs text-muted">{report.summary.paying} pagan · {report.summary.notPaying} no pagan (más de {PLATFORM_GRACE_MONTHS} meses sin pedir)</p>
          </article>
          <article className={card}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Neto facturado por la plataforma</h2><Receipt className="h-5 w-5 text-muted" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatCOP(report.summary.totalNet)}</p>
            <p className="mt-2 text-xs text-muted">Sin IVA, menos notas crédito, facturado en Odoo en el mes</p>
          </article>
        </div>

        <details className="rounded-2xl border border-border bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Reglas del acuerdo</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
            <li>Cliente de plataforma: empresa del portal desde el mes de su primer pedido aprobado hecho por la plataforma.</li>
            <li>Base: valor neto (sin IVA y menos notas crédito) facturado en Odoo durante el mes calendario por pedidos hechos en la plataforma.</li>
            <li>Por debajo de {formatCOP(PLATFORM_FEE_THRESHOLD)}: {formatCOP(PLATFORM_FEE_LOW)}. Desde {formatCOP(PLATFORM_FEE_THRESHOLD)}: {formatCOP(PLATFORM_FEE_HIGH)}.</li>
            <li>Con más de {PLATFORM_GRACE_MONTHS} meses calendario seguidos sin pedir, el cliente no paga hasta que vuelva a pedir.</li>
            <li>Corte el último día del mes; desde el día 1 se consulta la liquidación del mes anterior para facturar.</li>
          </ul>
        </details>

        {report.warnings.map((warning) => <p key={warning} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{warning}</p>)}

        <div tabIndex={0} role="region" aria-labelledby="liquidacion-tabla" className="hidden overflow-auto rounded-2xl border border-border bg-white md:block" style={{ maxBlockSize: 'min(720px, 80vh)' }}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption id="liquidacion-tabla" className="px-4 py-3 text-left font-semibold">Liquidación de {monthLabel(report.month)}</caption>
            <thead className="sticky top-0 z-10 bg-background-light">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Pedidos del mes</th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Neto facturado</th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Estado</th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Valor a cobrar</th>
              </tr>
            </thead>
            <tbody>
              {report.clients.map((client) => (
                <tr key={client.companyId}>
                  <th scope="row" className="border-t border-border px-4 py-3 text-left font-medium">
                    {client.name}
                    <span className="block text-xs font-normal text-muted">Desde {monthLabel(client.activationMonth)}{client.invoices.length ? ` · ${client.invoices.map((invoice) => invoice.name).join(', ')}` : ''}</span>
                  </th>
                  <td className="border-t border-border px-4 py-3 text-right tabular-nums">{client.ordersInMonth}</td>
                  <td className="border-t border-border px-4 py-3 text-right tabular-nums">{formatCOP(client.netInvoiced)}</td>
                  <td className="border-t border-border px-4 py-3">
                    <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', STATUS_TONE[client.status])}>{LIQUIDATION_STATUS_LABELS[client.status]}</span>
                    <span className="mt-1 block text-xs text-muted">{statusDetail(client)}</span>
                  </td>
                  <td className="border-t border-border px-4 py-3 text-right font-semibold tabular-nums">{formatCOP(client.fee)}</td>
                </tr>
              ))}
              {report.clients.length === 0 && <tr><td colSpan={5} className="border-t border-border px-4 py-6 text-center text-muted">Sin clientes de plataforma en este mes.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="border-t-2 border-border px-4 py-3 text-left">Total</th>
                <td className="border-t-2 border-border px-4 py-3" />
                <td className="border-t-2 border-border px-4 py-3 text-right font-semibold tabular-nums">{formatCOP(report.summary.totalNet)}</td>
                <td className="border-t-2 border-border px-4 py-3" />
                <td className="border-t-2 border-border px-4 py-3 text-right font-semibold tabular-nums">{formatCOP(report.summary.totalFee)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <ul className="space-y-3 md:hidden" aria-label={`Liquidación de ${monthLabel(report.month)}`}>
          {report.clients.map((client) => (
            <li key={client.companyId} className={card}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{client.name}</p>
                <p className="shrink-0 font-semibold tabular-nums">{formatCOP(client.fee)}</p>
              </div>
              <p className="mt-1 text-sm text-muted">Neto facturado {formatCOP(client.netInvoiced)} · {client.ordersInMonth} {client.ordersInMonth === 1 ? 'pedido' : 'pedidos'}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className={cn('rounded-md px-2 py-0.5 font-medium', STATUS_TONE[client.status])}>{LIQUIDATION_STATUS_LABELS[client.status]}</span><span className="text-muted">{statusDetail(client)}</span></p>
            </li>
          ))}
        </ul>
      </>}
    </div>
  );
}
