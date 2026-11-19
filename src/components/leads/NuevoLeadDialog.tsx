'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useLightDismiss } from '@/lib/ui/useLightDismiss';

const input = 'mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm';

/** Registro manual de un lead (prospección de la asesora). Dirección puede asignarlo a una asesora. */
export default function NuevoLeadDialog({ open, advisors, canAssign, onClose, onCreated }: {
  open: boolean;
  advisors: { id: string; nombre: string }[];
  canAssign: boolean;
  onClose: () => void;
  onCreated: (leadId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLightDismiss(dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/leads/interno', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? 'No se pudo registrar el lead.');
      form.reset();
      onCreated(payload.lead.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo registrar el lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} {...({ closedby: 'any' } as Record<string, string>)} aria-labelledby="nuevo-lead-titulo" onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-900/40">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="nuevo-lead-titulo" className="text-lg font-semibold">Nuevo lead</h2>
            <p className="text-sm text-muted">{canAssign ? 'Regístralo y asígnalo a una asesora, o déjalo sin asignar.' : 'Queda asignado a ti para que hagas su seguimiento.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-muted hover:bg-background-light"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <label className="block text-sm font-medium">Nombre del contacto<input name="nombre" required maxLength={120} autoComplete="off" className={input} /></label>
        <label className="block text-sm font-medium">Empresa<input name="empresa" maxLength={160} autoComplete="off" className={input} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Teléfono<input name="telefono" type="tel" inputMode="tel" maxLength={30} placeholder="300 123 4567" autoComplete="off" className={input} /></label>
          <label className="block text-sm font-medium">Correo<input name="email" type="email" maxLength={254} autoComplete="off" className={input} /></label>
        </div>
        <label className="block text-sm font-medium">¿Qué necesita?<textarea name="mensaje" rows={3} maxLength={2000} className={`${input} py-2`} /></label>
        <label className="block text-sm font-medium">Estado
          <select name="estado" defaultValue="nuevo" className={input}>
            <option value="nuevo">Nuevo: aún no lo he contactado</option>
            <option value="contactado">Contactado: ya hablé con esta persona</option>
          </select>
        </label>
        {canAssign && (
          <label className="block text-sm font-medium">Asignar a
            <select name="asignado_a" defaultValue="" className={input}>
              <option value="">Sin asignar</option>
              {advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.nombre}</option>)}
            </select>
          </label>
        )}
        <p className="text-xs text-muted">Escribe al menos un teléfono o un correo.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium hover:bg-background-light">Cancelar</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-white disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Registrar lead
          </button>
        </div>
      </form>
    </dialog>
  );
}
