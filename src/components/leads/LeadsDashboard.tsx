'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Bell, Download, Inbox, LayoutGrid, List, Loader2, Mail, MessageCircle, Phone, RefreshCw, Search, SlidersHorizontal, Target, TrendingUp, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import LeadDetail, { AttributionChip, type LeadRow } from '@/components/leads/LeadDetail';
import { normalizeSearchText } from '@/lib/busqueda/buscar';
import { useLightDismiss } from '@/lib/ui/useLightDismiss';
import {
  ATTRIBUTION_LABELS, LEAD_CONTACT_SLA_HOURS, LEAD_CONVERSION_GOAL, LEAD_ESTADOS, LEAD_PERIOD_DAYS, buildLeadSummary, buildLeadsCsv,
  formatHours, formatTimeAgo, hoursSince, isLeadOverdue, leadAttribution, leadSource, whatsappLink, type LeadAttribution, type LeadEstado,
} from '@/lib/leads/seguimiento';
import { cn } from '@/lib/utils';

type Chip = 'todos' | 'atrasados' | LeadEstado;
type Loaded = { key: string; leads: LeadRow[]; tracking: boolean; advisors: { id: string; nombre: string }[]; warnings: string[]; error: string | null; now: number };

const card = 'rounded-2xl border border-border bg-white';
const ESTADO_TONE: Record<string, string> = { nuevo: 'bg-blue-50 text-blue-700', contactado: 'bg-amber-50 text-amber-800', convertido: 'bg-emerald-50 text-emerald-800', descartado: 'bg-background-light text-muted' };
const ESTADO_DOT: Record<LeadEstado, string> = { nuevo: 'bg-blue-500', contactado: 'bg-amber-500', convertido: 'bg-primary', descartado: 'bg-slate-400' };
const ATTRIBUTION_BAR: Record<LeadAttribution, string> = { google_ads: 'bg-fuchsia-600', utm: 'bg-blue-500', organico: 'bg-slate-300' };
const WIDE_QUERY = '(min-width: 1280px)';
const subscribeWide = (callback: () => void) => {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};
const estadoLabel = (estado: string) => LEAD_ESTADOS.find((option) => option.value === estado)?.label ?? estado;

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

function QuickActions({ lead }: { lead: LeadRow }) {
  const whatsapp = whatsappLink(lead.telefono, lead.nombre);
  const action = 'flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-background-light hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary';
  return (
    <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
      {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={action} aria-label={`WhatsApp a ${lead.nombre}`}><MessageCircle className="h-4 w-4" aria-hidden="true" /></a>}
      {lead.telefono && <a href={`tel:${lead.telefono}`} className={action} aria-label={`Llamar a ${lead.nombre}`}><Phone className="h-4 w-4" aria-hidden="true" /></a>}
      {lead.email && <a href={`mailto:${lead.email}`} className={action} aria-label={`Correo a ${lead.nombre}`}><Mail className="h-4 w-4" aria-hidden="true" /></a>}
    </div>
  );
}

/** Seguimiento comercial de leads (propuesta de Leads): indicadores, embudo, origen, lista o tablero y detalle. */
export default function LeadsDashboard() {
  const { user } = useAuth();
  const canDelete = user?.rol === 'super_admin' || user?.rol === 'direccion';
  const [showAll, setShowAll] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<Chip>('todos');
  const [sourceFilter, setSourceFilter] = useState('todos');
  const [attributionFilter, setAttributionFilter] = useState<'todos' | LeadAttribution>('todos');
  const [view, setView] = useState<'lista' | 'tablero'>('lista');
  // Enlace directo desde los correos de aviso: ?lead=<uuid>
  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('lead')));
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLightDismiss(dialogRef);
  const key = `${showAll}:${refresh}`;
  const sidePanel = wide && view === 'lista';

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: '500' });
    if (!showAll) params.set('desde', new Date(Date.now() - 2 * LEAD_PERIOD_DAYS * 86_400_000).toISOString());
    fetch(`/api/leads?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? 'No se pudieron cargar los leads.');
        setData({
          key, leads: Array.isArray(payload.leads) ? payload.leads : [], tracking: Boolean(payload.features?.seguimiento),
          advisors: Array.isArray(payload.asesoras) ? payload.asesoras : [], warnings: Array.isArray(payload.warnings) ? payload.warnings : [], error: null, now: Date.now(),
        });
      })
      .catch((error) => { if (!controller.signal.aborted) setData({ key, leads: [], tracking: false, advisors: [], warnings: [], error: error instanceof Error ? error.message : 'No se pudieron cargar los leads.', now: Date.now() }); });
    return () => controller.abort();
  }, [key, showAll]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedId && !sidePanel) { if (!dialog.open) dialog.showModal(); }
    else if (dialog.open) dialog.close();
  }, [selectedId, sidePanel]);

  const current = data?.key === key ? data : null;
  const now = current?.now ?? 0;
  const leads = useMemo(() => current?.leads ?? [], [current]);
  const summary = useMemo(() => buildLeadSummary(leads, now), [leads, now]);
  const base = showAll ? leads : leads.filter((lead) => Date.parse(lead.created_at) >= now - LEAD_PERIOD_DAYS * 86_400_000);
  const sources = [...new Set(base.map((lead) => leadSource(lead.fuente).label))].sort((a, b) => a.localeCompare(b, 'es'));
  const needle = normalizeSearchText(search);
  const matchesChip = (lead: LeadRow, value: Chip) => value === 'todos' || (value === 'atrasados' ? isLeadOverdue(lead, now) : lead.estado === value);
  const matchesOthers = (lead: LeadRow) => (sourceFilter === 'todos' || leadSource(lead.fuente).label === sourceFilter)
    && (attributionFilter === 'todos' || leadAttribution(lead) === attributionFilter)
    && (!needle || normalizeSearchText([lead.nombre, lead.empresa, lead.email, lead.telefono, lead.mensaje].filter(Boolean).join(' ')).includes(needle));
  const filtered = base.filter((lead) => matchesChip(lead, chip) && matchesOthers(lead));
  const chipCount = (value: Chip) => base.filter((lead) => matchesChip(lead, value) && matchesOthers(lead)).length;
  const maxSource = Math.max(1, ...summary.sources.map((source) => source.count));

  const updateLead = (patch: Partial<LeadRow> & { id: string }) => setData((previous) => previous && { ...previous, leads: previous.leads.map((lead) => (lead.id === patch.id ? { ...lead, ...patch } : lead)) });
  const removeLead = (id: string) => { setData((previous) => previous && { ...previous, leads: previous.leads.filter((lead) => lead.id !== id) }); setSelectedId(null); };

  const chips: { value: Chip; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'atrasados', label: 'Sin contactar a tiempo' }, ...LEAD_ESTADOS.map((option) => ({ value: option.value as Chip, label: option.label }))];

  const leadCard = (lead: LeadRow, compact = false) => {
    const overdue = isLeadOverdue(lead, now);
    const selected = lead.id === selectedId;
    const product = lead.empaques_personalizado ? `${lead.empaques_personalizado.tipo_empaque} · ${lead.empaques_personalizado.cantidad} u` : null;
    return (
      <article onClick={() => setSelectedId(lead.id)}
        className={cn('cursor-pointer rounded-xl border border-l-4 bg-white p-4 transition-colors hover:bg-background-light/60', overdue ? 'border-l-red-500' : selected ? 'border-l-primary' : 'border-l-transparent', selected ? 'border-primary/40 bg-primary/5' : 'border-border')}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(lead.id); }} className="text-left font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-primary">{lead.nombre}</button>
              {lead.empresa && <span className="text-sm text-muted">{lead.empresa}</span>}
              <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', ESTADO_TONE[lead.estado] ?? ESTADO_TONE.descartado)}>{estadoLabel(lead.estado)}</span>
              {overdue && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">Sin contactar · {Math.floor(hoursSince(lead.created_at, now))} h</span>}
            </p>
            {!compact && lead.mensaje && <p className="mt-1 truncate text-sm text-foreground/80">{lead.mensaje}</p>}
            {!compact && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-md bg-background-light px-2 py-0.5 font-medium">{leadSource(lead.fuente).label}</span>
                <AttributionChip lead={lead} />
                {product && <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-[#5c7004]">{product}</span>}
                <span className="text-muted">· {lead.asignado_nombre ?? 'Sin asignar'}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="text-xs text-muted">{formatTimeAgo(lead.created_at, now)}</span>
            {!compact && <QuickActions lead={lead} />}
          </div>
        </div>
      </article>
    );
  };

  const detail = selectedId && current ? (
    <LeadDetail key={selectedId} leadId={selectedId} now={now} tracking={current.tracking} advisors={current.advisors} canDelete={canDelete}
      onClose={() => setSelectedId(null)} onUpdated={updateLead} onDeleted={removeLead} />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted">Contactos del sitio público y Empaques · {showAll ? 'todos los registros' : `últimos ${LEAD_PERIOD_DAYS} días`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.rol === 'super_admin' && <Link href="/admin/configuracion#leads-notificaciones" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-background-light"><Bell className="h-4 w-4" aria-hidden="true" />Notificaciones</Link>}
          <button type="button" disabled={filtered.length === 0} onClick={() => download(`leads-${new Date(now || 0).toISOString().slice(0, 10)}.csv`, buildLeadsCsv(filtered))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-background-light disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" />Exportar CSV</button>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-background-light" aria-label="Actualizar"><RefreshCw className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>

      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Cargando leads…</p>}
      {current?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}
      {current && !current.tracking && !current.error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Asignación de asesoras, tiempo de respuesta e historial de notas se activan al ejecutar la migración 056 en Supabase.</p>}
      {current?.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}

      {current && !current.error && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className={cn(card, 'p-5', summary.overdue > 0 && 'border-red-200')}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Sin contactar</h2><Inbox className="h-5 w-5 text-red-500" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.uncontacted}</p>
            <p className={cn('mt-2 text-xs', summary.overdue > 0 ? 'text-red-700' : 'text-muted')}>{summary.overdue > 0 ? `${summary.overdue} superan ${LEAD_CONTACT_SLA_HOURS} h de respuesta` : `Todos dentro del plazo de ${LEAD_CONTACT_SLA_HOURS} h`}</p>
          </article>
          <article className={cn(card, 'p-5')}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Leads · {LEAD_PERIOD_DAYS} días</h2><UserPlus className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.total}</p>
            <p className={cn('mt-2 text-xs', summary.changePercent === null ? 'text-muted' : summary.changePercent >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              {summary.changePercent === null ? 'Sin datos del período anterior' : `${summary.changePercent >= 0 ? '↑' : '↓'} ${Math.abs(summary.changePercent).toLocaleString('es-CO')}% vs ${LEAD_PERIOD_DAYS} días anteriores (${summary.previousTotal})`}
            </p>
          </article>
          <article className={cn(card, 'p-5')}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Tasa de conversión</h2><Target className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.conversionPercent === null ? '—' : `${summary.conversionPercent.toLocaleString('es-CO')}%`}</p>
            <p className="mt-2 text-xs text-muted">{summary.converted} convertidos · meta {LEAD_CONVERSION_GOAL}%</p>
          </article>
          <article className={cn(card, 'p-5')}>
            <div className="flex items-start justify-between"><h2 className="text-sm text-muted">Desde Google Ads</h2><TrendingUp className="h-5 w-5 text-fuchsia-600" aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{summary.googleAds.percent === null ? '—' : `${summary.googleAds.percent.toLocaleString('es-CO')}%`}</p>
            <p className="mt-2 text-xs text-muted">{summary.googleAds.count} leads · {summary.googleAds.converted} convertidos</p>
          </article>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
          <section aria-labelledby="leads-embudo" className={cn(card, 'p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="leads-embudo" className="font-semibold">Embudo · {LEAD_PERIOD_DAYS} días</h2><p className="text-xs text-muted">Clic en una etapa para filtrar</p></div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {summary.funnel.map((stage) => (
                <button key={stage.estado} type="button" aria-pressed={chip === stage.estado} onClick={() => setChip(chip === stage.estado ? 'todos' : stage.estado)}
                  className={cn('rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-primary', chip === stage.estado ? 'border-foreground' : 'border-border hover:bg-background-light')}>
                  <span className="flex items-center gap-1.5 text-sm font-medium"><span className={cn('h-2 w-2 rounded-full', ESTADO_DOT[stage.estado])} aria-hidden="true" />{estadoLabel(stage.estado)}</span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums">{stage.count}</span>
                  <span className="mt-2 block h-1.5 rounded-full bg-background-light" aria-hidden="true"><span className={cn('block h-full rounded-full', ESTADO_DOT[stage.estado])} style={{ width: `${stage.percent ?? 0}%` }} /></span>
                  <span className="mt-2 block text-xs text-muted">
                    {stage.estado === 'nuevo' ? `sin contactar · de ${summary.total} recibidos`
                      : stage.estado === 'contactado' ? `${(stage.percent ?? 0).toLocaleString('es-CO')}%${summary.averageResponseHours !== null ? ` · resp. media ${formatHours(summary.averageResponseHours)}` : ''}`
                        : stage.estado === 'convertido' ? `${(stage.percent ?? 0).toLocaleString('es-CO')}% del total` : 'spam o fuera de perfil'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="leads-origen" className={cn(card, 'p-5')}>
            <div className="flex items-center justify-between"><h2 id="leads-origen" className="font-semibold">De dónde llegan</h2><p className="text-xs text-muted">leads · convertidos</p></div>
            <ul className="mt-4 space-y-2.5">
              {summary.sources.slice(0, 6).map((source) => (
                <li key={source.label}>
                  <button type="button" aria-pressed={sourceFilter === source.label} onClick={() => setSourceFilter(sourceFilter === source.label ? 'todos' : source.label)} className="grid w-full grid-cols-[minmax(0,11.5rem)_1fr_auto] items-center gap-3 rounded-lg text-left text-sm focus-visible:outline-2 focus-visible:outline-primary">
                    <span className={cn('truncate', sourceFilter === source.label && 'font-semibold')}>{source.label}</span>
                    <span className="relative h-2 rounded-full bg-background-light" aria-hidden="true">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-primary/35" style={{ width: `${source.count / maxSource * 100}%` }} />
                      <span className="absolute inset-y-0 left-0 rounded-full bg-[#5c7004]" style={{ width: `${source.converted / maxSource * 100}%` }} />
                    </span>
                    <span className="font-semibold tabular-nums">{source.count} · {source.converted}</span>
                  </button>
                </li>
              ))}
              {summary.sources.length === 0 && <li className="text-sm text-muted">Sin leads en el período.</li>}
            </ul>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-background-light" aria-hidden="true">
              {summary.attribution.map((entry) => <span key={entry.kind} className={ATTRIBUTION_BAR[entry.kind]} style={{ width: `${entry.percent ?? 0}%` }} />)}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {summary.attribution.map((entry) => <span key={entry.kind} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-sm', ATTRIBUTION_BAR[entry.kind])} aria-hidden="true" />{ATTRIBUTION_LABELS[entry.kind]} <strong className="text-foreground">{(entry.percent ?? 0).toLocaleString('es-CO')}%</strong></span>)}
            </p>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar leads</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, empresa, correo…" className="min-h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm" />
          </label>
          <div role="group" aria-label="Filtrar por estado" className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {chips.map((option) => (
              <button key={option.value} type="button" aria-pressed={chip === option.value} onClick={() => setChip(option.value)}
                className={cn('min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary',
                  chip === option.value ? 'border-foreground bg-foreground text-white' : option.value === 'atrasados' ? 'border-red-200 bg-white text-red-700' : 'border-border bg-white hover:bg-background-light')}>
                {option.label} <span className="ml-1 tabular-nums opacity-70">{chipCount(option.value)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <details className="relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-dashed border-border bg-white px-3.5 text-sm font-medium"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Fuente · Atribución{(sourceFilter !== 'todos' || attributionFilter !== 'todos') && ' (activo)'}</summary>
            <div className="absolute left-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-border bg-white p-4 shadow-lg">
              <label className="block text-sm font-medium">Fuente
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-border px-2 py-2 text-sm">
                  <option value="todos">Todas</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Atribución
                <select value={attributionFilter} onChange={(event) => setAttributionFilter(event.target.value as 'todos' | LeadAttribution)} className="mt-1 w-full rounded-lg border border-border px-2 py-2 text-sm">
                  <option value="todos">Toda</option>{(['google_ads', 'utm', 'organico'] as const).map((kind) => <option key={kind} value={kind}>{ATTRIBUTION_LABELS[kind]}</option>)}
                </select>
              </label>
            </div>
          </details>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAll((value) => !value)} className="min-h-10 rounded-full border border-border bg-white px-3.5 text-sm font-medium hover:bg-background-light">{showAll ? `Solo últimos ${LEAD_PERIOD_DAYS} días` : 'Incluir anteriores'}</button>
            <div role="group" aria-label="Vista" className="flex rounded-xl border border-border bg-white p-1">
              {([['lista', 'Lista', List], ['tablero', 'Tablero', LayoutGrid]] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium', view === value ? 'bg-foreground text-white' : 'text-muted hover:text-foreground')}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-sm text-muted" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}</p>

        {view === 'lista' ? (
          <div className={cn('grid grid-cols-1 gap-6', sidePanel && 'xl:grid-cols-[minmax(0,1fr)_26rem]')}>
            <ul className="space-y-3">
              {filtered.map((lead) => <li key={lead.id}>{leadCard(lead)}</li>)}
              {filtered.length === 0 && <li className={cn(card, 'p-6 text-center text-sm text-muted')}>No hay leads con estos filtros.</li>}
            </ul>
            {sidePanel && (
              <aside aria-labelledby={selectedId ? 'lead-detalle-titulo' : undefined} className={cn(card, 'sticky top-20 h-[calc(100vh-6rem)] overflow-hidden')}>
                {detail ?? <p className="p-8 text-center text-sm text-muted">Selecciona un lead para ver su detalle, cambiar su estado o asignarlo.</p>}
              </aside>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {LEAD_ESTADOS.map((stage) => {
              const items = filtered.filter((lead) => lead.estado === stage.value);
              return (
                <section key={stage.value} aria-labelledby={`tablero-${stage.value}`} className="rounded-2xl bg-background-light p-3">
                  <h2 id={`tablero-${stage.value}`} className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold"><span className={cn('h-2 w-2 rounded-full', ESTADO_DOT[stage.value])} aria-hidden="true" />{stage.label}<span className="ml-auto text-muted tabular-nums">{items.length}</span></h2>
                  <ul className="space-y-2">{items.map((lead) => <li key={lead.id}>{leadCard(lead, true)}</li>)}</ul>
                </section>
              );
            })}
          </div>
        )}
      </>}

      <dialog ref={dialogRef} {...({ closedby: 'any' } as Record<string, string>)} aria-labelledby="lead-detalle-titulo"
        onClose={() => { if (!window.matchMedia(WIDE_QUERY).matches || view === 'tablero') setSelectedId(null); }}
        className="m-0 ml-auto h-full max-h-none w-full max-w-lg bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-900/40">
        {!sidePanel && detail}
      </dialog>
    </div>
  );
}
