'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mail, Plus, Save, Trash2 } from 'lucide-react';
import { MAX_LEAD_RECIPIENTS, parseLeadNotificationSettings, type LeadNotificationSettings as Settings } from '@/lib/notifications/leadRecipients';

export default function LeadNotificationSettings() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resendConfigured, setResendConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(saved));

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/configuracion/leads', { cache: 'no-store', signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!res.ok || !data?.settings) throw new Error(data?.error || 'No se pudieron cargar los destinatarios.');
      setSaved(data.settings);
      setDraft(data.settings);
      setResendConfigured(data.resendConfigured === true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los destinatarios.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving || loading) return;
    setError(null);
    setMessage(null);
    let payload;
    try { payload = parseLeadNotificationSettings({ ...draft, expected_updated_at: draft.updated_at }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Revisa los destinatarios.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/configuracion/leads', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.settings) throw new Error(data?.error || 'No se pudieron guardar los destinatarios.');
      setSaved(data.settings);
      setDraft(data.settings);
      setResendConfigured(data.resendConfigured === true);
      setMessage('Destinatarios guardados. El cambio aplica a nuevos avisos; no se reenviaron correos anteriores.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudieron guardar los destinatarios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="leads-notificaciones" aria-labelledby="lead-recipient-title" className="scroll-mt-24 rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="lead-recipient-title" className="flex items-center gap-2 text-lg font-bold text-slate-900"><Mail className="h-5 w-5" />Correos para avisos de leads</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Solo Super Admin puede cambiar esta lista privada. Se usa para solicitudes nuevas del sitio, incluidos los empaques personalizados. Agregar un correo no crea una cuenta ni otorga acceso al panel o a los archivos.</p>
        </div>
        <button type="button" disabled={saving || loading} onClick={() => { if (!dirty || window.confirm('Recargar descartará tus cambios sin guardar. ¿Continuar?')) void load(); }} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Recargar lista</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Consultando destinatarios…</p> : draft && (
        <form onSubmit={save} method="post" autoComplete="off" className="mt-5 space-y-4">
          {!resendConfigured && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Falta completar la configuración de Resend. Guardar la lista no garantiza la entrega de correos.</p>}
          <fieldset disabled={saving} className="space-y-4">
            <legend className="sr-only">Destinatarios de avisos de leads</legend>
            <label htmlFor="lead-alerts-active" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input id="lead-alerts-active" name="activo" type="checkbox" checked={draft.activo} onChange={(event) => setDraft({ ...draft, activo: event.target.checked })} className="h-4 w-4 accent-primary" />Activar avisos para nuevos leads
            </label>
            <p className="text-xs text-slate-500">Desactivar no cancela correos que ya estaban en la cola. Las plantillas y el proveedor conservan su configuración independiente.</p>
            <div className="space-y-3">
              {draft.destinatarios.map((recipient, index) => (
                <div key={index} className="grid items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label htmlFor={`lead-email-${index}`} className="block space-y-1 text-sm font-semibold text-slate-700">Correo {index + 1}
                    <input id={`lead-email-${index}`} name={`destinatarios[${index}].email`} type="email" required maxLength={254} value={recipient.email} onChange={(event) => setDraft({ ...draft, destinatarios: draft.destinatarios.map((item, position) => position === index ? { ...item, email: event.target.value } : item) })} className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" />
                  </label>
                  <label htmlFor={`lead-name-${index}`} className="block space-y-1 text-sm font-semibold text-slate-700">Nombre (opcional)
                    <input id={`lead-name-${index}`} name={`destinatarios[${index}].nombre`} maxLength={120} value={recipient.nombre ?? ''} onChange={(event) => setDraft({ ...draft, destinatarios: draft.destinatarios.map((item, position) => position === index ? { ...item, nombre: event.target.value } : item) })} className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" />
                  </label>
                  <button type="button" aria-label={`Quitar destinatario ${index + 1}`} onClick={() => setDraft({ ...draft, destinatarios: draft.destinatarios.filter((_, position) => position !== index) })} className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"><Trash2 className="h-4 w-4" />Quitar</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" disabled={draft.destinatarios.length >= MAX_LEAD_RECIPIENTS} onClick={() => setDraft({ ...draft, destinatarios: [...draft.destinatarios, { email: '', nombre: null }] })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><Plus className="h-4 w-4" />Agregar correo</button>
              <button type="submit" disabled={!dirty} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar destinatarios</button>
            </div>
            <p className="text-xs text-slate-500">Máximo {MAX_LEAD_RECIPIENTS} direcciones. Los correos repetidos se guardan una sola vez. Este formulario no envía mensajes de prueba.</p>
          </fieldset>
        </form>
      )}
    </section>
  );
}
