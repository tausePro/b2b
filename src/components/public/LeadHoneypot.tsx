'use client';

import { LEAD_HONEYPOT_FIELD } from '@/lib/leads/validation';

/**
 * Campo trampa invisible para bots (mismo patrón que el configurador de
 * personalizados). Las personas no lo ven ni lo alcanzan con el teclado; si
 * llega con valor, el servidor rechaza la solicitud.
 */
export default function LeadHoneypot({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
      Sitio web
      <input name={LEAD_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
