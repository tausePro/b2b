'use client';

import { useEffect, useState } from 'react';
import { BadgeDollarSign, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import KpiCard from '@/components/ui/KpiCard';
import { getBogotaCalendarDate, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import {
  REGULAR_COMMISSION_LABELS, regularCommissionPeriod,
  type PackagingCommissionPayment, type RegularCommissionBreakdown, type RegularCommissionReport,
} from '@/lib/comisiones/habitual';

const moneyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const timestampFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
const cell = 'px-4 py-3 text-right tabular-nums align-top';
const heading = 'px-4 py-3 text-right font-medium text-muted';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function commissionMonthLabel(month: string): string {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
}

function Amount({ value, known }: { value: number | null; known?: number }) {
  return <><span className={value === null ? 'text-amber-800' : value < 0 ? 'text-danger' : undefined}>{value === null && known === undefined ? 'Pendiente' : moneyFormatter.format(value ?? known!)}</span>{value === null && known !== undefined && <span className="mt-1 block text-xs text-amber-800">Parcial · requiere revisión</span>}</>;
}

export function CommissionBreakdown({ breakdown }: { breakdown: RegularCommissionBreakdown[] }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label="Comisión habitual discriminada por categoría" tabIndex={0}>
      <table className="w-full text-sm">
        <caption className="sr-only">Comisión por categoría sobre ventas netas sin IVA, con notas crédito y ajustes conservando su signo.</caption>
        <thead><tr className="border-b border-border bg-background-light/50"><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Categoría de comisión</th><th scope="col" className={heading}>Facturación sin IVA</th><th scope="col" className={heading}>Notas crédito</th><th scope="col" className={heading}>Base neta</th><th scope="col" className={heading}>Comisión calculada</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Pago</th></tr></thead>
        <tbody>{breakdown.map(row => <tr key={row.kind} className="border-b border-border/50">
          <th scope="row" className="px-4 py-3 text-left align-top font-medium">{REGULAR_COMMISSION_LABELS[row.kind]}{row.rate !== null && <span className="ml-1 text-primary">{row.rate}%</span>}</th>
          <td className={cell}><Amount value={row.invoicedSales} /></td><td className={cell}><Amount value={row.creditNotes} /></td><td className={cell}><Amount value={row.netSales} /></td>
          <td className={cell}><Amount value={row.commission} known={row.knownCommission} />{row.missingCommissionLines > 0 && <span className="mt-1 block text-xs text-muted">{row.missingCommissionLines} líneas pendientes</span>}</td>
          <td className="px-4 py-3 align-top text-muted">{row.kind === 'packaging' ? 'Mes siguiente a la facturación' : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

export function PackagingPayments({ payments }: { payments: PackagingCommissionPayment[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(payments.length / 50));
  const current = Math.min(page, totalPages);
  return (
    <details className="overflow-hidden rounded-xl border border-border bg-white">
      <summary className="cursor-pointer px-5 py-4 font-semibold">Empaques 2% · mes previsto de pago</summary>
      <p className="px-5 pb-3 text-xs text-muted">Desglose según las fechas y filtros consultados. Las notas crédito ajustan la base del mes en que se registran. El mes previsto no confirma un pago realizado.</p>
      <div className="overflow-x-auto" role="region" aria-label="Comisiones de Empaques por mes y asesora" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Comisión de Soluciones de Empaques por mes de facturación, asesora y mes siguiente de pago.</caption>
          <thead><tr className="border-b border-border bg-background-light/50"><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Asesora</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Facturación</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Pago previsto</th><th scope="col" className={heading}>Base neta sin IVA</th><th scope="col" className={heading}>Comisión 2%</th></tr></thead>
          <tbody>{payments.slice((current - 1) * 50, current * 50).map(row => <tr key={`${row.advisorId ?? 'none'}:${row.invoiceMonth}`} className="border-b border-border/50">
            <th scope="row" className="px-4 py-3 text-left align-top font-medium">{row.advisorName}</th>
            <td className="px-4 py-3 align-top">{commissionMonthLabel(row.invoiceMonth)}{!row.completeMonth && <span className="mt-1 block text-xs text-amber-800">Mes parcial según el rango</span>}</td>
            <td className="px-4 py-3 align-top">{commissionMonthLabel(row.paymentMonth)}</td>
            <td className={cell}><Amount value={row.netSales} /></td><td className={cell}><Amount value={row.commission} known={row.knownCommission} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      {payments.length === 0 && <p className="px-5 pb-4 text-sm text-muted">Sin facturación de Soluciones de Empaques en esta consulta.</p>}
      {totalPages > 1 && <nav aria-label="Páginas de pagos previstos de Empaques" className="flex items-center justify-between gap-3 p-4 text-sm"><span>Página {current} de {totalPages}</span><div className="flex gap-2"><button type="button" className={button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button><button type="button" className={button} disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Siguiente</button></div></nav>}
    </details>
  );
}

export default function ComisionHabitual({ period, advisorId, refresh }: { period: string; advisorId: string; refresh: number }) {
  const { user } = useAuth();
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([user?.id, period, advisorId, refresh, retry]);
  const [result, setResult] = useState<{ key: string; data: RegularCommissionReport | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        regularCommissionPeriod(period, getBogotaCalendarDate());
        const params = new URLSearchParams({ periodo: period });
        if (advisorId !== 'all') params.set('asesor_id', advisorId);
        const response = await fetch(`/api/comisiones/habitual?${params}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.status === 401 || (response.redirected && new URL(response.url).pathname === '/login')) throw new Error('Inicia sesión para consultar tu comisión.');
        if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar la comisión habitual.');
        const data = payload as RegularCommissionReport;
        if (data?.period !== period || data.currency !== 'COP' || !Array.isArray(data.breakdown) || !Array.isArray(data.advisors)
          || !Array.isArray(data.payments) || typeof data.canViewTeam !== 'boolean'
          || !data.breakdown.some(row => row.kind === 'packaging')
          || data.advisors.some(advisor => !Array.isArray(advisor.breakdown) || !advisor.breakdown.some(row => row.kind === 'packaging'))
          || (advisorId !== 'all' && data.advisorId !== advisorId)
          || (!data.canViewTeam && data.advisorId !== user.id)) throw new Error('La respuesta no corresponde al período y la asesora solicitados.');
        setResult({ key, data, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, data: null, error: error instanceof Error ? error.message : 'No se pudo consultar la comisión habitual.' });
      }
    };
    void load();
    return () => controller.abort();
  }, [key, user?.id, period, advisorId]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const packaging = data?.breakdown.find(row => row.kind === 'packaging');
  return (
    <section className="space-y-4" aria-label="Comisión habitual por categoría">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Comisión habitual · Empaques 2%</h2><p className="mt-1 text-sm text-muted">Facturas publicadas sin IVA, menos notas crédito. El 2% se aplica a Soluciones de Empaques y sus subcategorías; el bono plataforma 0,5% conserva su liquidación separada.</p></div><button type="button" className={button} onClick={() => setRetry(value => value + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar comisión</button></div>
      {!current && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Consultando comisiones de Odoo…</div>}
      {current?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}
      {data && packaging && <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard title="Base neta Empaques" value={moneyFormatter.format(packaging.netSales)} subtitle={`${packaging.invoiceCount} facturas · ${packaging.creditNoteCount} notas crédito`} icon={<BadgeDollarSign className="h-5 w-5" aria-hidden="true" />} />
          <KpiCard title="Comisión Empaques 2%" value={moneyFormatter.format(packaging.commission ?? packaging.knownCommission)} subtitle={packaging.commission === null ? 'Parcial: revisar líneas pendientes' : `${commissionMonthLabel(data.period)} · Cálculo para revisión`} icon={<BadgeDollarSign className="h-5 w-5" aria-hidden="true" />} />
          <KpiCard title="Mes previsto de pago de Empaques" value={commissionMonthLabel(data.paymentPeriod)} subtitle={data.completeMonth ? 'Mes facturado terminado; no confirma pago realizado' : 'Mes en curso: importe provisional'} icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />} />
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-white"><CommissionBreakdown breakdown={data.breakdown} /></div>
        {data.canViewTeam && <div className="overflow-x-auto rounded-xl border border-border bg-white" role="region" aria-label="Comisión mensual por asesora" tabIndex={0}>
          <table className="w-full text-sm"><caption className="sr-only">Desglose de la comisión habitual por asesora; no incluye bono plataforma.</caption><thead><tr className="border-b border-border bg-background-light/50"><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Asesora</th><th scope="col" className={heading}>Base Empaques</th><th scope="col" className={heading}>Comisión Empaques 2%</th><th scope="col" className={heading}>Otras comisiones</th><th scope="col" className={heading}>Total habitual</th></tr></thead>
            <tbody>{data.advisors.map(advisor => {
              const pack = advisor.breakdown.find(row => row.kind === 'packaging')!;
              const others = advisor.breakdown.filter(row => row.kind !== 'packaging');
              const otherKnown = roundCurrency(others.reduce((sum, row) => sum + row.knownCommission, 0));
              const otherMissing = others.some(row => row.commission === null);
              const totalKnown = roundCurrency(otherKnown + pack.knownCommission);
              return <tr key={advisor.id ?? 'none'} className="border-b border-border/50"><th scope="row" className="px-4 py-3 text-left align-top font-medium">{advisor.name}</th><td className={cell}><Amount value={pack.netSales} /></td><td className={cell}><Amount value={pack.commission} known={pack.knownCommission} /></td><td className={cell}><Amount value={otherMissing ? null : otherKnown} known={otherKnown} /></td><td className={cell}><Amount value={otherMissing || pack.commission === null ? null : totalKnown} known={totalKnown} /></td></tr>;
            })}</tbody></table>
        </div>}
        <PackagingPayments payments={data.payments} />
        <p className="text-xs text-muted">Consultado: {timestampFormatter.format(new Date(data.generatedAt))} (Bogotá). Este bloque calcula la comisión comercial; las acciones de cerrar o marcar pagado pertenecen al bono plataforma de abajo.</p>
      </>}
    </section>
  );
}
