'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { userHasAnyRole } from '@/lib/auth/roles';
import { AlertCircle, BadgeDollarSign, Building2, CheckCircle2, FileText, Loader2, LockKeyhole, RefreshCw } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import { useAuth } from '@/contexts/AuthContext';
import { getBogotaCalendarDate, getCommissionPeriodRange, PLATFORM_BONUS_START_DATE, roundCurrency } from '@/lib/comisiones/bonoPlataforma';
import type { CommissionPeriodStatus, PlatformBonusClientSummary, PlatformBonusDetail, PlatformBonusTotals } from '@/lib/comisiones/bonoPlataforma';

const bonusCurrencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const invoiceDateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

type BonusResult = {
  advisor: { id: string; name: string; odooUserId: number | null };
  period: string;
  periodDate: string;
  percentage: number;
  clients: PlatformBonusClientSummary[];
  details: PlatformBonusDetail[];
  totals: PlatformBonusTotals;
  warnings: string[];
  blockingIssues: string[];
  status: CommissionPeriodStatus;
  source: 'live' | 'snapshot';
  periodId: string | null;
  version: number;
  calculationHash: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  paidAt: string | null;
  generatedAt: string | null;
};

type BonusResponse = {
  period: string;
  percentage: number;
  canManage: boolean;
  results: BonusResult[];
};

const EMPTY_TOTALS: PlatformBonusTotals = {
  activeClients: 0,
  invoiceCount: 0,
  creditNoteCount: 0,
  invoicedBase: 0,
  creditNotes: 0,
  netBase: 0,
  bonus: 0,
};

function currentBogotaPeriod(): string {
  return getBogotaCalendarDate().slice(0, 7);
}

function periodValidationError(period: string): string | null {
  if (!period) return 'Selecciona un periodo válido para consultar el bono plataforma.';
  try {
    getCommissionPeriodRange(period);
  } catch (validationError) {
    return validationError instanceof Error ? validationError.message : 'El periodo indicado no es válido.';
  }
  return period > currentBogotaPeriod() ? 'El periodo no puede ser posterior al mes actual en Bogotá.' : null;
}

function formatBonusCOP(value: number): string {
  return bonusCurrencyFormatter.format(value);
}

function formatInvoiceDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : invoiceDateFormatter.format(date);
}

function apiErrorMessage(status: number, payload: { code?: string; error?: string; blockingIssues?: string[] }, fallback: string): string {
  if (status === 503 && payload.code === 'MIGRATION_REQUIRED') {
    return 'El bono plataforma requiere actualizar la base de datos. Solicita al administrador aplicar manualmente las migraciones pendientes del bono plataforma en Supabase y luego pulsa Actualizar. La gestión permanecerá bloqueada hasta completar este paso.';
  }
  const message = [payload.error || fallback, ...(payload.blockingIssues ?? [])].join(' ');
  return status === 409 ? `${message} Pulsa Actualizar y revisa la liquidación antes de volver a intentarlo.` : message;
}

function addTotals(results: BonusResult[]): PlatformBonusTotals {
  const totals = results.reduce((total, result) => ({
    activeClients: total.activeClients,
    invoiceCount: total.invoiceCount + result.totals.invoiceCount,
    creditNoteCount: total.creditNoteCount + result.totals.creditNoteCount,
    invoicedBase: total.invoicedBase + result.totals.invoicedBase,
    creditNotes: total.creditNotes + result.totals.creditNotes,
    netBase: total.netBase + result.totals.netBase,
    bonus: total.bonus + result.totals.bonus,
  }), { ...EMPTY_TOTALS });
  totals.activeClients = new Set(results.flatMap((result) => result.clients.map((client) => client.id))).size;
  totals.invoicedBase = roundCurrency(totals.invoicedBase);
  totals.creditNotes = roundCurrency(totals.creditNotes);
  totals.netBase = roundCurrency(totals.netBase);
  totals.bonus = roundCurrency(totals.bonus);
  return totals;
}

function statusLabel(status: CommissionPeriodStatus): string {
  if (status === 'cerrado') return 'Cerrada';
  if (status === 'pagado') return 'Pagada';
  return 'Provisional';
}

function statusClass(status: CommissionPeriodStatus): string {
  if (status === 'cerrado') return 'bg-blue-100 text-blue-700';
  if (status === 'pagado') return 'bg-green-100 text-green-700';
  return 'bg-amber-100 text-amber-700';
}

function financialMonthQuery(period: string): string {
  if (periodValidationError(period)) return '';
  const range = getCommissionPeriodRange(period);
  const today = getBogotaCalendarDate();
  return new URLSearchParams({ desde: range.startDate, hasta: range.endDate > today ? today : range.endDate }).toString();
}

function ComisionesReport({ initialPeriod, initialAdvisorId }: { initialPeriod: string; initialAdvisorId: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [currentPeriod, setCurrentPeriod] = useState(currentBogotaPeriod);
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState<BonusResponse | null>(null);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState(initialAdvisorId);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const periodError = periodValidationError(period);

  const loadData = useCallback(async (requestedPeriod: string) => {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setData(null);
    setError(null);
    if (periodValidationError(requestedPeriod)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/comisiones/bono-plataforma?periodo=${encodeURIComponent(requestedPeriod)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json();
      if (controller.signal.aborted || loadRequest.current !== controller) return;
      if (!response.ok) throw new Error(apiErrorMessage(response.status, payload, 'No se pudo consultar el bono plataforma.'));
      const resultData = payload as BonusResponse;
      if (resultData.period !== requestedPeriod || resultData.results.some((result) => result.period !== requestedPeriod)) {
        throw new Error('La respuesta no corresponde al periodo solicitado. Pulsa Actualizar para volver a consultar.');
      }
      setData(resultData);
      setSelectedAdvisorId((previous) => {
        if (!resultData.canManage) return resultData.results[0]?.advisor.id ?? 'all';
        return resultData.results.some((result) => result.advisor.id === previous) ? previous : 'all';
      });
    } catch (loadError) {
      if (controller.signal.aborted || loadRequest.current !== controller) return;
      setData(null);
      setError(loadError instanceof Error ? loadError.message : 'No se pudo consultar el bono plataforma.');
    } finally {
      if (!controller.signal.aborted && loadRequest.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) void loadData(period);
    return () => loadRequest.current?.abort();
  }, [loadData, period, userId]);

  useEffect(() => {
    const refreshCurrentPeriod = () => setCurrentPeriod(currentBogotaPeriod());
    const interval = window.setInterval(refreshCurrentPeriod, 60_000);
    window.addEventListener('focus', refreshCurrentPeriod);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshCurrentPeriod);
      mutationRequest.current?.abort();
    };
  }, []);

  const selectedResult = useMemo(
    () => data?.period === period
      ? data.results.find((result) => result.advisor.id === selectedAdvisorId && result.period === period) ?? null
      : null,
    [data, period, selectedAdvisorId],
  );
  const totals = useMemo(
    () => addTotals(selectedResult ? [selectedResult] : data?.results ?? []),
    [data?.results, selectedResult],
  );
  const bonusByStatus = useMemo(() => {
    const amounts = { provisional: 0, cerrado: 0, pagado: 0 };
    for (const result of data?.results ?? []) amounts[result.status] += result.totals.bonus;
    return amounts;
  }, [data?.results]);
  const selectedBlockingIssues = selectedResult?.blockingIssues ?? [];
  const canClosePeriod = !!selectedResult?.calculationHash && selectedResult.source === 'live' && selectedResult.period < currentPeriod;
  const canManageSelected = !!data?.canManage && !!selectedResult && Number.isSafeInteger(selectedResult.version)
    && !loading && !processing && !error && !periodError;
  const bonusTitle = selectedResult
    ? { provisional: 'Bono provisional', cerrado: 'Bono cerrado', pagado: 'Bono pagado' }[selectedResult.status]
    : 'Bono total del equipo';
  const bonusSubtitle = selectedResult
    ? { provisional: '0,5% adicional · Sujeto a cierre', cerrado: 'Importe congelado · Pendiente de pago', pagado: 'Registro de pago · Sin transferencia' }[selectedResult.status]
    : `Provisional: ${formatBonusCOP(bonusByStatus.provisional)} · Cerrado: ${formatBonusCOP(bonusByStatus.cerrado)} · Pago registrado: ${formatBonusCOP(bonusByStatus.pagado)}`;

  const managePeriod = async (action: 'close' | 'reopen' | 'mark_paid') => {
    if (!selectedResult || !canManageSelected || mutationRequest.current) return;
    if (action === 'close' && (!canClosePeriod || selectedResult.status !== 'provisional' || selectedBlockingIssues.length > 0 || selectedResult.period >= currentBogotaPeriod())) return;
    if (action !== 'close' && selectedResult.status !== 'cerrado') return;
    const actionResult = selectedResult;
    const actionText = action === 'close' ? 'cerrar' : action === 'reopen' ? 'reabrir' : 'marcar como pagada';
    const paymentNotice = action === 'mark_paid'
      ? '\n\nEsta acción solo registra un pago ya realizado por fuera del portal. No envía dinero ni ejecuta transferencias bancarias.'
      : '';
    if (!window.confirm(`¿Confirmas ${actionText} la liquidación de ${actionResult.advisor.name} del periodo ${actionResult.period}?${paymentNotice}`)) return;

    const controller = new AbortController();
    mutationRequest.current = controller;
    loadRequest.current?.abort();
    setProcessing(true);
    setError(null);
    try {
      const response = await fetch('/api/comisiones/bono-plataforma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action,
          asesor_id: actionResult.advisor.id,
          periodo: actionResult.period,
          expected_version: actionResult.version,
          expected_calculation_hash: actionResult.calculationHash,
        }),
      });
      const payload = await response.json();
      if (controller.signal.aborted || mutationRequest.current !== controller) return;
      if (!response.ok) throw new Error(apiErrorMessage(response.status, payload, 'No se pudo actualizar la liquidación.'));
      await loadData(actionResult.period);
    } catch (manageError) {
      if (controller.signal.aborted || mutationRequest.current !== controller) return;
      setError(manageError instanceof Error ? manageError.message : 'No se pudo actualizar la liquidación. Pulsa Actualizar para comprobar su estado.');
    } finally {
      if (mutationRequest.current === controller) {
        mutationRequest.current = null;
        if (!controller.signal.aborted) setProcessing(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bono Plataforma</h1>
          <p className="mt-1 text-sm text-muted">
            Bono adicional del 0,5% sobre facturación sin IVA originada por clientes activos mediante el portal.
            {' '}Marcar pagada solo registra un pago realizado por fuera del portal; no envía dinero ni ejecuta transferencias bancarias.
          </p>
          {userHasAnyRole(user, ['direccion', 'super_admin']) && (
            <Link href={`/dashboard/gerencia?${financialMonthQuery(period)}`} className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark">
              Ver rentabilidad general y comisión habitual
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {data?.canManage && (
            <label className="text-sm font-medium text-foreground">
              Asesora
              <select
                value={selectedAdvisorId}
                onChange={(event) => {
                  if (!mutationRequest.current && !loading && !error) setSelectedAdvisorId(event.target.value);
                }}
                disabled={processing || loading || !!error}
                className="mt-1 block min-w-56 rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="all">Resumen del equipo</option>
                {data.results.map((result) => (
                  <option key={result.advisor.id} value={result.advisor.id}>{result.advisor.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-foreground">
            Periodo
            <input
              type="month"
              min={PLATFORM_BONUS_START_DATE.slice(0, 7)}
              max={currentPeriod}
              value={period}
              required
              aria-invalid={!!periodError}
              aria-describedby={periodError ? 'bonus-error' : undefined}
              disabled={processing}
              onChange={(event) => {
                if (mutationRequest.current || event.target.value === period) return;
                loadRequest.current?.abort();
                setData(null);
                setError(null);
                setLoading(!periodValidationError(event.target.value));
                setPeriod(event.target.value);
              }}
              className="mt-1 block rounded-lg border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!mutationRequest.current) void loadData(period);
            }}
            disabled={loading || processing || !!periodError}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-background-light disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {(periodError || error) && (
        <div id="bonus-error" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{periodError || error}{data && ' La gestión está bloqueada. Pulsa Actualizar para comprobar el estado de la liquidación.'}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !data || data.period !== period || periodError ? null : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title={bonusTitle} value={formatBonusCOP(totals.bonus)} subtitle={bonusSubtitle} icon={<BadgeDollarSign className="h-5 w-5" />} />
            <KpiCard title="Base neta" value={formatBonusCOP(totals.netBase)} subtitle="Sin IVA y menos notas crédito" icon={<FileText className="h-5 w-5" />} />
            <KpiCard title="Clientes activos" value={String(totals.activeClients)} subtitle="Con acceso vigente al portal" icon={<Building2 className="h-5 w-5" />} />
            <KpiCard title="Documentos" value={String(totals.invoiceCount + totals.creditNoteCount)} subtitle={`${totals.invoiceCount} facturas · ${totals.creditNoteCount} notas crédito`} icon={<CheckCircle2 className="h-5 w-5" />} />
          </div>

          {data.canManage && !selectedResult && (
            <div className="overflow-hidden rounded-xl border border-border bg-white">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-foreground">Resumen por asesora</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Resumen del bono plataforma por asesora</caption>
                  <thead>
                    <tr className="border-b border-border bg-background-light/50">
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Asesora</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Clientes</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Base neta</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Bono</th>
                      <th scope="col" className="px-4 py-3 text-center font-medium text-muted">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((result) => (
                      <tr key={result.advisor.id} className="border-b border-border/50">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">
                          {userHasAnyRole(user, ['direccion', 'super_admin']) && result.advisor.odooUserId !== null && Number.isSafeInteger(result.advisor.odooUserId) && result.advisor.odooUserId > 0 ? (
                            <Link href={`/dashboard/comisiones/asesoras/${result.advisor.odooUserId}?${financialMonthQuery(period)}`} className="text-primary underline underline-offset-4 hover:text-primary-dark">
                              {result.advisor.name}
                            </Link>
                          ) : result.advisor.name}
                        </th>
                        <td className="px-4 py-3 text-right">{result.totals.activeClients}</td>
                        <td className="px-4 py-3 text-right">{formatBonusCOP(result.totals.netBase)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatBonusCOP(result.totals.bonus)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(result.status)}`}>{statusLabel(result.status)}</span>
                          {(result.blockingIssues ?? []).length > 0 && (
                            <div className="mt-2 text-left text-xs text-red-700">
                              <p className="font-medium">Cierre bloqueado</p>
                              <ul className="mt-1 list-disc space-y-1 pl-5">
                                {result.blockingIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedResult && (
            <>
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-foreground">{selectedResult.advisor.name}</h2>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(selectedResult.status)}`}>{statusLabel(selectedResult.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {selectedResult.source === 'snapshot' ? 'Liquidación congelada para auditoría.' : 'Cálculo provisional consultado en Odoo.'}
                    {' '}{selectedResult.status === 'pagado'
                      ? 'Pago registrado administrativamente, sin transferencia desde el portal.'
                      : selectedResult.status === 'cerrado'
                        ? 'Pendiente de registrar el pago.'
                        : 'El bono puede cambiar hasta el cierre.'}
                  </p>
                </div>
                {data.canManage && (
                  <div className="flex flex-wrap gap-2">
                    {selectedResult.status === 'provisional' && (
                      <button
                        type="button"
                        onClick={() => managePeriod('close')}
                        disabled={!canManageSelected || !canClosePeriod || selectedBlockingIssues.length > 0}
                        title={selectedBlockingIssues.length > 0
                          ? 'Corrige los bloqueos indicados y actualiza la consulta antes de cerrar.'
                          : !canClosePeriod ? 'El periodo podrá cerrarse cuando termine el mes en Bogotá.' : undefined}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <LockKeyhole className="h-4 w-4" /> Cerrar periodo
                      </button>
                    )}
                    {selectedResult.status === 'cerrado' && (
                      <>
                        <button type="button" onClick={() => managePeriod('reopen')} disabled={!canManageSelected} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">Reabrir</button>
                        <button type="button" onClick={() => managePeriod('mark_paid')} disabled={!canManageSelected} title="Solo registra un pago realizado por fuera del portal; no ejecuta transferencias bancarias." className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Marcar pagada</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {selectedBlockingIssues.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  <p className="font-medium">No se puede cerrar esta liquidación</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {selectedBlockingIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
                  </ul>
                  <p className="mt-1">Solicita corregir la información indicada y pulsa Actualizar para comprobar los bloqueos.</p>
                </div>
              )}

              {selectedResult.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium">Información pendiente en Odoo</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {selectedResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-border bg-white">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-semibold text-foreground">Liquidación por cliente</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Detalle del bono plataforma por cliente activo</caption>
                    <thead>
                      <tr className="border-b border-border bg-background-light/50">
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Facturas</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Facturación</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Notas crédito</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Base neta</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Bono 0,5%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResult.clients.map((client) => (
                        <tr key={client.id} className="border-b border-border/50">
                          <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">{client.name}</th>
                          <td className="px-4 py-3 text-right">{client.invoiceCount}</td>
                          <td className="px-4 py-3 text-right">{formatBonusCOP(client.invoicedBase)}</td>
                          <td className="px-4 py-3 text-right text-red-600">{client.creditNotes > 0 ? `−${formatBonusCOP(client.creditNotes)}` : formatBonusCOP(0)}</td>
                          <td className="px-4 py-3 text-right">{formatBonusCOP(client.netBase)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatBonusCOP(client.bonus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedResult.clients.length === 0 && <p className="p-8 text-center text-sm text-muted">No hay clientes activos elegibles en este periodo.</p>}
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-white">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-semibold text-foreground">Documentos incluidos</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Facturas y notas crédito incluidas en la liquidación</caption>
                    <thead>
                      <tr className="border-b border-border bg-background-light/50">
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Documento Odoo</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Fecha</th>
                        <th scope="col" className="px-4 py-3 text-left font-medium text-muted">Tipo</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Base sin IVA</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium text-muted">Bono</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResult.details.map((detail) => (
                        <tr key={`${detail.companyId}-${detail.invoiceId}`} className="border-b border-border/50">
                          <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">{detail.invoiceName || detail.invoiceId}</th>
                          <td className="px-4 py-3">{detail.companyName}</td>
                          <td className="px-4 py-3 text-muted">{formatInvoiceDate(detail.invoiceDate)}</td>
                          <td className="px-4 py-3">{detail.documentType === 'out_refund' ? 'Nota crédito' : 'Factura'}</td>
                          <td className={`px-4 py-3 text-right ${detail.netBase < 0 ? 'text-red-600' : ''}`}>{formatBonusCOP(detail.netBase)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${detail.bonus < 0 ? 'text-red-600' : ''}`}>{formatBonusCOP(detail.bonus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedResult.details.length === 0 && <p className="p-8 text-center text-sm text-muted">Aún no hay facturas publicadas de pedidos del portal en este periodo.</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ComisionesLocation() {
  const searchParams = useSearchParams();
  return <ComisionesReport key={searchParams.toString()} initialPeriod={searchParams.get('periodo') ?? currentBogotaPeriod()} initialAdvisorId={searchParams.get('asesor_id') ?? 'all'} />;
}

export default function ComisionesPage() {
  return <Suspense fallback={<div className="flex items-center justify-center gap-3 py-20 text-sm text-muted" role="status"><Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />Cargando liquidación…</div>}><ComisionesLocation /></Suspense>;
}
