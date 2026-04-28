'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { readLeadAttributionCookie } from '@/lib/analytics/leadAttribution';

interface EmpaquesQuoteFormProps {
  categoryOptions: string[];
}

export default function EmpaquesQuoteForm({ categoryOptions }: EmpaquesQuoteFormProps) {
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    tipoEmpaque: '',
    mensaje: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ whatsappUrl: string | null } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const attribution = readLeadAttributionCookie();
      const mensaje = [
        form.tipoEmpaque ? `Tipo de empaque: ${form.tipoEmpaque}` : null,
        form.mensaje,
      ].filter(Boolean).join('\n\n');

      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          empresa: form.empresa,
          email: form.email,
          telefono: form.telefono,
          mensaje,
          fuente: 'empaques_cotizacion',
          attribution,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo enviar la solicitud');
      }

      setSuccess({ whatsappUrl: data.whatsapp_url || null });
      setForm({ nombre: '', empresa: '', email: '', telefono: '', tipoEmpaque: '', mensaje: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-[1.5rem] border border-green-200 bg-green-50/70 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h3 className="mt-5 text-2xl font-black text-slate-950">Solicitud recibida</h3>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Un asesor especializado revisará tu requerimiento de Empaques y te contactará.
        </p>
        {success.whatsappUrl && (
          <a
            href={success.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#9CBB06] px-7 py-3 text-sm font-black text-slate-950 transition hover:bg-[#8cab05]"
          >
            Continuar por WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mx-auto mt-4 block text-xs font-bold text-slate-500 transition hover:text-slate-800"
        >
          Enviar otra solicitud
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-black text-slate-950">Nombre Completo</label>
          <input
            required
            minLength={2}
            type="text"
            value={form.nombre}
            onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
            placeholder="Tu nombre completo"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-black text-slate-950">Empresa</label>
          <input
            type="text"
            value={form.empresa}
            onChange={(event) => setForm((current) => ({ ...current, empresa: event.target.value }))}
            placeholder="Nombre de tu empresa"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-black text-slate-950">Correo Corporativo</label>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="correo@empresa.com"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-black text-slate-950">Teléfono</label>
          <input
            type="tel"
            value={form.telefono}
            onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
            placeholder="+57 300 000 0000"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-black text-slate-950">Tipo de Empaque Requerido</label>
        <select
          value={form.tipoEmpaque}
          onChange={(event) => setForm((current) => ({ ...current, tipoEmpaque: event.target.value }))}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20"
        >
          <option value="">Selecciona una opción</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-black text-slate-950">Detalles del Proyecto / Volumen Estimado</label>
        <textarea
          rows={4}
          value={form.mensaje}
          onChange={(event) => setForm((current) => ({ ...current, mensaje: event.target.value }))}
          placeholder="Describe brevemente tus necesidades..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:ring-2 focus:ring-[#9CBB06]/20"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#9CBB06] px-8 py-4 text-base font-black text-slate-950 shadow-md shadow-[#9CBB06]/20 transition hover:bg-[#8cab05] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {loading ? 'Enviando...' : 'Solicitar Cotización'}
      </button>
    </form>
  );
}
