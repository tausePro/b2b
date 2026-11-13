'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Loader2, RefreshCw, Target, Users } from 'lucide-react';
import type { AdvisorBoard, ClientRow } from '@/lib/comercial/tablero.server';
import { ALERT_ACTIONS } from '@/lib/comercial/tablero';
import { cn, formatCOP } from '@/lib/utils';

type Payload = { board?: AdvisorBoard; team?: AdvisorBoard[]; canViewTeam: boolean };
type AlertFilter = 'todas' | 'prioritaria' | 'seguimiento' | 'sin_gestion';

const card = 'rounded-2xl border border-border bg-white p-5';
const input = 'min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm';
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-white disabled:opacity-50';
const TREND = {
  creciendo: { label: 'Creciendo', tone: 'bg-emerald-50 text-emerald-800', Icon: ArrowUpRight },
  estable: { label: 'Estable', tone: 'bg-slate-100 text-slate-700', Icon: ArrowRight },
  bajando: { label: 'Bajando', tone: 'bg-red-50 text-red-700', Icon: ArrowDownRight },
} as const;
const pct = (value: number | null) => (value === null ? 'sin base de comparación' : `${value > 0 ? '+' : ''}${value.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`);
const dateLabel = (iso: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
const actionLabel = (value: string) => ALERT_ACTIONS.find((action) => action.value === value)?.label ?? value;

async function send(method: 'POST' | 'PUT', body: Record<string, unknown>) {
  const response = await fetch('/api/comercial/tablero', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? 'No se pudo guardar.');
}

function TrendChip({ board }: { board: AdvisorBoard }) {
  const trend = board.sales.trend ? TREND[board.sales.trend] : null;
  if (!trend) return <span className="rounded-full bg-background-light px-2.5 py-1 text-xs font-medium text-muted">Sin comparación</span>;
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', trend.tone)}><trend.Icon className="h-3.5 w-3.5" aria-hidden="true" />{trend.label}</span>;
}

function GoalEditor({ board, onSaved }: { board: AdvisorBoard; onSaved: () => void }) {
  const [value, setValue] = useState(board.sales.goal ? String(board.sales.goal) : '');
  const [status, setStatus] = useState<string | null>(null);
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4" onSubmit={(event) => {
      event.preventDefault();
      setStatus('Guardando…');
      send('PUT', { tipo: 'meta', asesorId: board.advisor.id, mes: board.today.slice(0, 7), valor: value ? Number(value) : null })
        .then(() => { setStatus('Meta guardada.'); onSaved(); })
        .catch((error) => setStatus(error instanceof Error ? error.message : 'No se pudo guardar.'));
    }}>
      <label className="min-w-48 flex-1 text-sm font-medium">Meta del mes (ventas sin IVA)
        <input type="number" min="1" step="1" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} className={cn(input, 'mt-1')} placeholder="Ej. 150000000" />
      </label>
      <button type="submit" className={primary}>Guardar meta</button>
      {status && <p role="status" className="w-full text-sm text-muted">{status}</p>}
    </form>
  );
}

function AlertItem({ row, board, canEditThreshold, onSaved }: { row: ClientRow; board: AdvisorBoard; canEditThreshold: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState('');
  const [valor, setValor] = useState('');
  const [days, setDays] = useState({ followUp: String(row.alert?.followAfter ?? ''), priority: String(row.alert?.priorityAfter ?? '') });
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const priority = row.alert?.level === 'prioritaria';
  const run = (promise: Promise<void>, success: string) => promise
    .then(() => { setStatus({ tone: 'ok', text: success }); setOpen(false); onSaved(); })
    .catch((error) => setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar.' }));
  return (
    <li className={cn('rounded-xl border border-l-4 border-border bg-white p-4', priority ? 'border-l-red-500' : 'border-l-amber-400')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">{row.name}
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', priority ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>{priority ? 'Prioritaria' : 'Seguimiento'}</span>
          </p>
          <p className="mt-1 text-sm">{row.alert?.reason}</p>
          <p className="mt-1 text-xs text-muted">Última compra {row.lastPurchase ? dateLabel(row.lastPurchase) : '—'} · {formatCOP(row.sales12m)} en 12 meses · {row.purchases} compras en 18 meses</p>
          {row.lastAction && (
            <p className="mt-2 rounded-lg bg-background-light px-3 py-2 text-xs"><span className="font-semibold">{actionLabel(row.lastAction.estado)}</span> · {dateLabel(row.lastAction.fecha)}{row.lastAction.autor ? ` · ${row.lastAction.autor}` : ''}
              {row.lastAction.valor ? ` · ${formatCOP(row.lastAction.valor)}` : ''}{row.lastAction.nota ? <span className="mt-0.5 block text-muted">{row.lastAction.nota}</span> : null}</p>
          )}
        </div>
        {board.features.gestion && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="min-h-10 shrink-0 rounded-xl border border-border px-3 text-sm font-medium hover:bg-background-light">Registrar gestión</button>}
      </div>
      {open && (
        <form className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          run(send('POST', { partnerId: row.partnerId, estado, nota, valor: estado === 'oportunidad' ? valor : null }), 'Gestión registrada.');
        }}>
          <label className="text-sm font-medium">¿Qué pasó?
            <select required value={estado} onChange={(event) => setEstado(event.target.value)} className={cn(input, 'mt-1')}>
              <option value="" disabled>Selecciona una opción</option>
              {ALERT_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
            </select>
          </label>
          {estado === 'oportunidad' && <label className="text-sm font-medium">Valor estimado (opcional)<input type="number" min="1" inputMode="numeric" value={valor} onChange={(event) => setValor(event.target.value)} className={cn(input, 'mt-1')} /></label>}
          <label className="text-sm font-medium sm:col-span-2">Nota{estado === 'otro' || estado === 'no_requiere' ? ' (obligatoria)' : ''}
            <textarea rows={2} maxLength={2000} value={nota} onChange={(event) => setNota(event.target.value)} className={cn(input, 'mt-1 py-2')} required={estado === 'otro' || estado === 'no_requiere'} />
          </label>
          <div className="sm:col-span-2"><button type="submit" className={primary}>Guardar gestión</button></div>
        </form>
      )}
      {canEditThreshold && board.features.gestion && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Ajustar alerta de este cliente</summary>
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => {
            event.preventDefault();
            run(send('PUT', { tipo: 'umbral', partnerId: row.partnerId, diasSeguimiento: Number(days.followUp), diasPrioritaria: Number(days.priority) }), 'Umbral guardado.');
          }}>
            <label className="w-36 font-medium">Seguimiento (días)<input type="number" min="1" max="730" required value={days.followUp} onChange={(event) => setDays({ ...days, followUp: event.target.value })} className={cn(input, 'mt-1')} /></label>
            <label className="w-36 font-medium">Prioritaria (días)<input type="number" min="2" max="1095" required value={days.priority} onChange={(event) => setDays({ ...days, priority: event.target.value })} className={cn(input, 'mt-1')} /></label>
            <button type="submit" className={primary}>Guardar</button>
            <button type="button" className="min-h-11 rounded-xl border border-border px-3 font-medium" onClick={() => run(send('PUT', { tipo: 'umbral', partnerId: row.partnerId, diasSeguimiento: null }), 'Vuelve a usar su ritmo aprendido.')}>Usar ritmo aprendido</button>
          </form>
        </details>
      )}
      {status && <p role={status.tone === 'error' ? 'alert' : 'status'} className={cn('mt-2 text-sm', status.tone === 'error' ? 'text-red-700' : 'text-emerald-700')}>{status.text}</p>}
    </li>
  );
}

function AdvisorView({ board, canEdit, onSaved }: { board: AdvisorBoard; canEdit: boolean; onSaved: () => void }) {
  const [filter, setFilter] = useState<AlertFilter>('todas');
  const { sales, clients } = board;
  const alerts = board.alerts.filter((row) => filter === 'todas' || (filter === 'sin_gestion' ? !row.lastAction : row.alert?.level === filter));
  const filters: [AlertFilter, string, number][] = [
    ['todas', 'Todas', board.alerts.length], ['prioritaria', 'Prioritarias', clients.priority], ['seguimiento', 'Seguimiento', clients.followUp],
    ['sin_gestion', 'Sin gestionar', board.alerts.filter((row) => !row.lastAction).length],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="ventas-mes" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="ventas-mes" className="text-sm text-muted">Ventas del mes · al {dateLabel(board.today)}</h2><TrendChip board={board} /></div>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{formatCOP(sales.sales)}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-background-light p-3"><dt className="text-xs text-muted">Mismo período del mes anterior</dt><dd className="font-semibold tabular-nums">{formatCOP(sales.previousMonth)} <span className="font-normal text-muted">({pct(sales.changeVsPreviousMonth)})</span></dd></div>
            <div className="rounded-xl bg-background-light p-3"><dt className="text-xs text-muted">Mismo período del año anterior</dt><dd className="font-semibold tabular-nums">{formatCOP(sales.previousYear)} <span className="font-normal text-muted">({pct(sales.changeVsPreviousYear)})</span></dd></div>
          </dl>
          <div className="mt-4">
            {sales.goal ? <>
              <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-1.5 font-medium"><Target className="h-4 w-4 text-primary" aria-hidden="true" />Meta {formatCOP(sales.goal)}</span><span className="font-semibold tabular-nums">{sales.goalProgress?.toLocaleString('es-CO')} %</span></div>
              <div className="mt-2 h-2.5 rounded-full bg-background-light" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, sales.goalProgress ?? 0)} aria-label="Cumplimiento de la meta"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, sales.goalProgress ?? 0)}%` }} /></div>
            </> : <p className="text-sm text-muted">Sin meta para este mes.</p>}
            <p className="mt-2 text-sm text-muted">A este ritmo cerrarías el mes en <strong className="text-foreground">{formatCOP(sales.projection)}</strong>{sales.goal ? ` (${Math.round(sales.projection / sales.goal * 100)} % de la meta)` : ''}.</p>
          </div>
          {canEdit && (board.features.gestion ? <GoalEditor board={board} onSaved={onSaved} /> : <p className="mt-4 border-t border-border pt-4 text-sm text-amber-800">Las metas se cargan al ejecutar la migración 057.</p>)}
        </section>
        <section aria-labelledby="mis-clientes" className={card}>
          <h2 id="mis-clientes" className="flex items-center gap-2 text-sm text-muted"><Users className="h-4 w-4" aria-hidden="true" />Clientes asignados en Odoo</h2>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{clients.assigned}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {([['Compraron este mes', clients.boughtThisMonth, ''], ['Al día con su ritmo', clients.active, 'text-emerald-700'], ['En seguimiento', clients.followUp, 'text-amber-700'], ['Prioritarias', clients.priority, 'text-red-700'], ['Sin compras en 18 meses', clients.withoutPurchases, 'text-muted']] as const)
              .map(([label, value, tone]) => <div key={label} className="rounded-xl bg-background-light p-3"><dt className="text-xs text-muted">{label}</dt><dd className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</dd></div>)}
          </dl>
        </section>
      </div>

      {board.frequentInactive.length > 0 && (
        <section aria-labelledby="frecuentes" className={card}>
          <h2 id="frecuentes" className="font-semibold">Clientes frecuentes que dejaron de comprar</h2>
          <p className="mt-1 text-sm text-muted">Compraban seguido y hoy están fuera de su ritmo; ordenados por lo que compraron en 12 meses.</p>
          <ol className="mt-3 divide-y divide-border">
            {board.frequentInactive.map((row) => (
              <li key={row.partnerId} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium">{row.name}</span><span className="block text-xs text-muted">{row.alert?.reason}</span></span>
                <span className="font-semibold tabular-nums">{formatCOP(row.sales12m)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="alertas" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="alertas" className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />A quién contactar</h2>
          <div role="group" aria-label="Filtrar alertas" className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {filters.map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn('min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium', filter === value ? 'border-foreground bg-foreground text-white' : 'border-border bg-white hover:bg-background-light')}>
                {label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>
        {!board.features.gestion && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Registrar la gestión de cada alerta se activa al ejecutar la migración 057 en Supabase.</p>}
        <ul className="space-y-3">
          {alerts.map((row) => <AlertItem key={row.partnerId} row={row} board={board} canEditThreshold={canEdit} onSaved={onSaved} />)}
          {alerts.length === 0 && <li className={cn(card, 'text-center text-sm text-muted')}>No hay clientes en esta lista.</li>}
        </ul>
      </section>
    </div>
  );
}

function TeamView({ team, onOpen }: { team: AdvisorBoard[]; onOpen: (id: string) => void }) {
  const total = team.reduce((sum, board) => ({ sales: sum.sales + board.sales.sales, previous: sum.previous + board.sales.previousMonth }), { sales: 0, previous: 0 });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Ventas del equipo en el mes: <strong className="text-foreground">{formatCOP(total.sales)}</strong> ({pct(total.previous ? Math.round((total.sales - total.previous) / total.previous * 1000) / 10 : null)} contra el mismo período del mes anterior).</p>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {team.map((board) => (
          <li key={board.advisor.id} className={card}>
            <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{board.advisor.name}</h2><TrendChip board={board} /></div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCOP(board.sales.sales)}</p>
            <p className="text-xs text-muted">Mes anterior {pct(board.sales.changeVsPreviousMonth)} · año anterior {pct(board.sales.changeVsPreviousYear)}</p>
            <p className="mt-2 text-sm">{board.sales.goal ? `Meta ${formatCOP(board.sales.goal)} · ${board.sales.goalProgress?.toLocaleString('es-CO')} %` : 'Sin meta este mes'}</p>
            <p className="mt-1 text-sm text-muted">{board.clients.boughtThisMonth} de {board.clients.assigned} clientes compraron · <span className="text-red-700">{board.clients.priority} prioritarias</span> · <span className="text-amber-700">{board.clients.followUp} seguimiento</span></p>
            <button type="button" onClick={() => onOpen(board.advisor.id)} className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm font-medium hover:bg-background-light">Ver tablero<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tablero comercial (pedido de Gerencia): ventas, clientes y alertas por ritmo de compra. */
export default function TableroComercial() {
  const [advisorId, setAdvisorId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: Payload | null; error: string | null } | null>(null);
  const key = `${advisorId ?? 'inicio'}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/comercial/tablero${advisorId ? `?asesora=${advisorId}` : ''}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? 'No se pudo cargar el tablero.');
        setState({ key, data, error: null });
      })
      .catch((error) => { if (!controller.signal.aborted) setState({ key, data: null, error: error instanceof Error ? error.message : 'No se pudo cargar el tablero.' }); });
    return () => controller.abort();
  }, [key, advisorId]);

  const current = state?.key === key ? state : null;
  const data = current?.data;
  const board = data?.board;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {advisorId && <button type="button" onClick={() => setAdvisorId(null)} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver al equipo</button>}
          <h1 className="text-2xl font-semibold tracking-tight">{board ? `Tablero comercial · ${board.advisor.name}` : 'Tablero comercial'}</h1>
          <p className="mt-1 text-sm text-muted">Ventas del mes comparadas, clientes y alertas según el ritmo de compra de cada cliente.</p>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} aria-label="Actualizar" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-3 hover:bg-background-light"><RefreshCw className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Calculando con Odoo; puede tardar unos segundos…</p>}
      {current?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}
      {board && <AdvisorView board={board} canEdit={Boolean(data?.canViewTeam)} onSaved={() => setRevision((value) => value + 1)} />}
      {data?.team && <TeamView team={data.team} onOpen={setAdvisorId} />}
    </div>
  );
}
