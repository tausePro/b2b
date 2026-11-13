'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, MessageCircle, Phone, Trash2, X } from 'lucide-react';
import EmpaquesDetalle from '@/components/leads/EmpaquesDetalle';
import type { EmpaquesPersonalizadosDetalle } from '@/lib/empaques/personalizados-shared';
import {
  ATTRIBUTION_LABELS, LEAD_ESTADOS, formatTimeAgo, leadAttribution, leadSource, whatsappLink, type LeadTrackingInput,
} from '@/lib/leads/seguimiento';
import { cn } from '@/lib/utils';

export interface LeadRow extends LeadTrackingInput {
  notas: string | null;
  whatsapp_enviado: boolean;
  updated_at: string;
  asignado_a?: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_url: string | null;
  click_at: string | null;
  empaques_personalizado: EmpaquesPersonalizadosDetalle | null;
}
export interface LeadEventView { id: string; tipo: string; detalle: string; created_at: string; autor: string | null }

const dateFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const ATTRIBUTION_TONE = { google_ads: 'bg-fuchsia-50 text-fuchsia-700', utm: 'bg-blue-50 text-blue-700', organico: 'bg-background-light text-muted' } as const;
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function landingPath(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).pathname || '/'; } catch { return url.slice(0, 60); }
}

export function AttributionChip({ lead }: { lead: Pick<LeadTrackingInput, 'gclid' | 'utm_source' | 'utm_medium' | 'utm_campaign'> }) {
  const kind = leadAttribution(lead);
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', ATTRIBUTION_TONE[kind])}>{ATTRIBUTION_LABELS[kind]}</span>;
}

/** Panel de detalle del lead: contacto, estado, asignación, empaque personalizado, atribución y actividad. */
export default function LeadDetail({ leadId, now, tracking, advisors, canDelete, onClose, onUpdated, onDeleted }: {
  leadId: string;
  now: number;
  tracking: boolean;
  advisors: { id: string; nombre: string }[];
  canDelete: boolean;
  onClose: () => void;
  onUpdated: (lead: Partial<LeadRow> & { id: string }) => void;
  onDeleted: (id: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; lead: LeadRow | null; events: LeadEventView[]; warnings: string[]; error: string | null } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [note, setNote] = useState('');
  const key = `${leadId}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/leads?id=${encodeURIComponent(leadId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? 'No se pudo abrir el lead.');
        if (data?.lead?.id !== leadId) throw new Error('La respuesta no corresponde al lead seleccionado.');
        setState({ key, lead: data.lead, events: Array.isArray(data.eventos) ? data.eventos : [], warnings: Array.isArray(data.warnings) ? data.warnings : [], error: null });
      })
      .catch((error) => { if (!controller.signal.aborted) setState({ key, lead: null, events: [], warnings: [], error: error instanceof Error ? error.message : 'No se pudo abrir el lead.' }); });
    return () => controller.abort();
  }, [leadId, key]);

  const current = state?.key === key ? state : null;
  const lead = current?.lead;

  const save = async (name: string, body: Record<string, unknown>, success: string) => {
    if (!lead) return;
    setSaving(name);
    setMessage(null);
    try {
      const response = await fetch('/api/leads', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, ...body }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? 'No se pudo guardar.');
      onUpdated({ id: lead.id, ...data.lead, asignado_nombre: data.lead?.asignado_nombre === undefined ? lead.asignado_nombre : data.lead.asignado_nombre });
      setMessage({ tone: 'ok', text: success });
      if (name === 'nota') setNote('');
      setRevision((value) => value + 1);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar.' });
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!lead || !window.confirm(`¿Eliminar el lead de ${lead.nombre}? Esta acción no se puede deshacer.`)) return;
    setSaving('eliminar');
    const response = await fetch(`/api/leads?id=${encodeURIComponent(lead.id)}`, { method: 'DELETE' });
    const data = await response.json().catch(() => null);
    setSaving(null);
    if (!response.ok) { setMessage({ tone: 'error', text: data?.error ?? 'No se pudo eliminar.' }); return; }
    onDeleted(lead.id);
  };

  const initials = lead ? lead.nombre.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() : '';
  const whatsapp = lead ? whatsappLink(lead.telefono, lead.nombre) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-[#5c7004]" aria-hidden="true">{initials || '…'}</span>
        <div className="min-w-0 flex-1">
          <h2 id="lead-detalle-titulo" className="truncate text-lg font-semibold">{lead?.nombre ?? 'Detalle del lead'}</h2>
          <p className="truncate text-sm text-muted">{lead?.empresa || 'Sin empresa'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="rounded-lg p-2 text-muted hover:bg-background-light focus-visible:outline-2 focus-visible:outline-primary"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Cargando el lead…</p>}
        {current?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{current.error}</p>}
        {lead && <>
          <div className="grid grid-cols-3 gap-2">
            {whatsapp
              ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(button, 'border-primary bg-primary text-slate-950 hover:bg-primary-dark')}><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</a>
              : <span className={cn(button, 'cursor-not-allowed opacity-50')} aria-disabled="true"><MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp</span>}
            {lead.telefono ? <a href={`tel:${lead.telefono}`} className={button}><Phone className="h-4 w-4" aria-hidden="true" />Llamar</a> : <span className={cn(button, 'opacity-50')} aria-disabled="true"><Phone className="h-4 w-4" aria-hidden="true" />Llamar</span>}
            {lead.email ? <a href={`mailto:${lead.email}`} className={button}><Mail className="h-4 w-4" aria-hidden="true" />Correo</a> : <span className={cn(button, 'opacity-50')} aria-disabled="true"><Mail className="h-4 w-4" aria-hidden="true" />Correo</span>}
          </div>

          <div role="group" aria-label="Estado del lead" className="grid grid-cols-4 gap-1 rounded-xl bg-background-light p-1">
            {LEAD_ESTADOS.map((option) => (
              <button key={option.value} type="button" aria-pressed={lead.estado === option.value} disabled={saving !== null}
                onClick={() => lead.estado !== option.value && save('estado', { estado: option.value }, `Estado: ${option.label}.`)}
                className={cn('min-h-10 rounded-lg px-1 text-xs font-medium sm:text-sm focus-visible:outline-2 focus-visible:outline-primary', lead.estado === option.value ? 'bg-white text-foreground shadow-sm' : 'text-muted hover:text-foreground')}>
                {option.label}
              </button>
            ))}
          </div>

          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2.5 text-sm">
            <dt className="text-muted">Correo</dt><dd className="break-all">{lead.email || 'No registrado'}</dd>
            <dt className="text-muted">Teléfono</dt><dd>{lead.telefono || 'No registrado'}</dd>
            <dt className="text-muted"><label htmlFor="lead-asesora">Asesora</label></dt>
            <dd>
              {tracking ? (
                <select id="lead-asesora" value={lead.asignado_a ?? ''} disabled={saving !== null}
                  onChange={(event) => save('asesora', { asignado_a: event.target.value || null }, event.target.value ? 'Asesora asignada; le enviamos un aviso.' : 'Lead sin asignar.')}
                  className="w-full rounded-lg border border-border bg-white px-2 py-1.5 font-medium">
                  <option value="">Sin asignar</option>
                  {advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.nombre}</option>)}
                </select>
              ) : <span className="text-muted">Disponible al ejecutar la migración 056</span>}
            </dd>
            <dt className="text-muted">Fuente</dt><dd>{leadSource(lead.fuente).label}</dd>
            <dt className="text-muted">Llegó</dt><dd>{formatTimeAgo(lead.created_at, now)} · {dateFormatter.format(new Date(lead.created_at))}</dd>
          </dl>

          {lead.mensaje && <blockquote className="whitespace-pre-wrap break-words rounded-xl bg-background-light p-4 text-sm">“{lead.mensaje}”</blockquote>}
          {lead.empaques_personalizado && <EmpaquesDetalle detail={lead.empaques_personalizado} />}

          <section aria-labelledby="lead-atribucion" className="space-y-2 text-sm">
            <h3 id="lead-atribucion" className="font-semibold">Atribución</h3>
            <AttributionChip lead={lead} />
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
              {[['Campaña', lead.utm_campaign], ['Fuente UTM', lead.utm_source], ['gclid', lead.gclid ? `${lead.gclid.slice(0, 10)}…${lead.gclid.slice(-4)}` : null], ['Llegada', landingPath(lead.landing_url)], ['Referente', lead.referrer]]
                .filter(([, value]) => value)
                .map(([label, value]) => <div key={label} className="contents"><dt className="text-muted">{label}</dt><dd className="break-all font-mono text-xs leading-5">{value}</dd></div>)}
            </dl>
          </section>

          <section aria-labelledby="lead-actividad" className="space-y-3">
            <h3 id="lead-actividad" className="text-sm font-semibold">Actividad</h3>
            <form className="flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              if (!note.trim()) return;
              void (tracking ? save('nota', { nota: note.trim() }, 'Nota guardada.') : save('nota', { notas: note.trim() }, 'Nota guardada.'));
            }}>
              <label htmlFor="lead-nota" className="sr-only">Nota de gestión</label>
              <textarea id="lead-nota" rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={tracking ? 'Agregar nota de gestión…' : 'Nota de gestión (reemplaza la anterior)…'}
                className="min-h-11 flex-1 resize-y rounded-xl border border-border px-3 py-2 text-sm" />
              <button type="submit" disabled={saving !== null || !note.trim()} className="self-start rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Guardar</button>
            </form>
            {lead.notas && <p className="rounded-xl border border-border p-3 text-sm"><span className="font-medium">Nota anterior:</span> {lead.notas}</p>}
            <ol className="space-y-3 border-l-2 border-border pl-4">
              {current.events.map((event) => (
                <li key={event.id} className="relative">
                  <span className={cn('absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full', event.tipo === 'sistema' ? 'bg-border' : 'bg-primary')} aria-hidden="true" />
                  <p className="text-sm">{event.detalle}</p>
                  <p className="text-xs text-muted">{formatTimeAgo(event.created_at, now)}{event.autor ? ` · ${event.autor}` : ''}</p>
                </li>
              ))}
            </ol>
          </section>

          {current.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>)}
          {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl p-3 text-sm', message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800')}>{message.text}</p>}
          {canDelete && <button type="button" onClick={remove} disabled={saving !== null} className="inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:underline disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" />Eliminar lead</button>}
        </>}
      </div>
    </div>
  );
}
