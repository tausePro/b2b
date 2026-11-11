'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, Loader2, RefreshCw, Users, Wallet } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import type { OpenBalanceReport } from '@/lib/gerencia/cartera';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });
const share = (part: number, total: number) => (total > 0 ? `${pct.format(part / total * 100)}%` : '—');
const cell = 'px-4 py-3 text-right tabular-nums align-top';
const heading = 'px-4 py-3 text-right font-medium text-muted';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Dashboard del rol Cartera: solo cuentas por cobrar (saldos, vencidos, antigüedad y clientes con más deuda). */
export default function DashboardCartera() {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ key: number; data: OpenBalanceReport | null; error: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/gerencia/cartera?${new URLSearchParams({ tipo: 'cobrar', estado: 'all', buscar: '', pagina: '1' })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? 'No se pudo consultar la cartera.');
        setState({ key: refresh, data: payload as OpenBalanceReport, error: null });
      })
      .catch(error => { if (!controller.signal.aborted) setState({ key: refresh, data: null, error: error instanceof Error ? error.message : 'No se pudo consultar la cartera.' }); });
    return () => controller.abort();
  }, [refresh]);

  const current = state?.key === refresh ? state : null;
  const data = current?.data;
  const receivable = data?.receivable;

  return (
    <section aria-labelledby="dashboard-cartera" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="dashboard-cartera" className="text-2xl font-bold text-foreground">Cartera</h1>
          <p className="mt-1 text-sm text-muted">{data ? `Cuentas por cobrar de ${data.company?.name ?? 'la compañía'} · datos de Odoo al ${dateFormatter.format(new Date(`${data.asOfDate}T00:00:00Z`))}` : 'Cuentas por cobrar de Odoo.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/cartera" className={button}>Ver detalle por documento<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          <button type="button" className={button} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar</button>
        </div>
      </div>

      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando la cartera en Odoo…</p>}
      {current?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}

      {data && receivable && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Por cobrar (facturas pendientes)" value={money.format(data.invoices ? data.invoices.receivable.total : receivable.balance)} subtitle={data.invoices ? `${data.invoices.receivable.documentCount} facturas, como el tablero de Odoo · Saldo contable: ${money.format(receivable.balance)}` : `${receivable.documentCount} documentos abiertos`} icon={<Wallet className="h-5 w-5" aria-hidden="true" />} />
          <KpiCard title="Cartera vencida" value={money.format(receivable.overdue)} subtitle={`${share(receivable.overdue, receivable.charges)} de los cargos por cobrar`} icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />} />
          <KpiCard title="Por vencer" value={money.format(receivable.notDue)} subtitle={`${share(receivable.notDue, receivable.charges)} de los cargos · sin fecha de vencimiento: ${money.format(receivable.withoutDueDate)}`} icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />} />
          <KpiCard title="Clientes con saldo" value={String(receivable.partnerCount)} subtitle={`${receivable.documentCount} documentos abiertos · abonos sin aplicar: ${money.format(receivable.credits)}`} icon={<Users className="h-5 w-5" aria-hidden="true" />} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="overflow-x-auto rounded-xl border border-border bg-white xl:col-span-2" role="region" aria-labelledby="cartera-antiguedad" tabIndex={0}>
            <table className="w-full text-sm">
              <caption id="cartera-antiguedad" className="px-4 py-3 text-left font-semibold">Antigüedad de la cartera vencida · {money.format(receivable.overdue)}</caption>
              <thead className="bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Días vencidos</th><th scope="col" className={heading}>Valor</th><th scope="col" className={heading}>Participación</th></tr></thead>
              <tbody>{receivable.aging.map(bucket => (
                <tr key={bucket.label} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{bucket.label}</th><td className={cell}>{money.format(bucket.amount)}</td><td className={cell}>{share(bucket.amount, receivable.overdue)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-white xl:col-span-3" role="region" aria-labelledby="cartera-clientes" tabIndex={0}>
            <table className="w-full text-sm">
              <caption id="cartera-clientes" className="px-4 py-3 text-left font-semibold">Clientes con más cartera vencida</caption>
              <thead className="bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th><th scope="col" className={heading}>Vencido</th><th scope="col" className={heading}>Saldo por cobrar</th><th scope="col" className={heading}>Documentos</th></tr></thead>
              <tbody>{data.topReceivablePartners.map(partner => (
                <tr key={partner.partnerName} className="border-t border-border"><th scope="row" className="px-4 py-3 text-left font-medium">{partner.partnerName}</th><td className={`${cell} ${partner.overdue > 0 ? 'text-danger' : ''}`}>{money.format(partner.overdue)}</td><td className={cell}>{money.format(partner.balance)}</td><td className={cell}>{partner.documentCount}</td></tr>
              ))}</tbody>
            </table>
            {data.topReceivablePartners.length === 0 && <p className="px-4 pb-4 text-sm text-muted">No hay clientes con saldo por cobrar.</p>}
          </div>
        </div>

        <div className="space-y-1">{data.warnings.map(warning => <p key={warning} className="text-xs text-muted">{warning}</p>)}</div>
      </>}
    </section>
  );
}
