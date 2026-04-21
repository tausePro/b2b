'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';

// Formulario de contacto publico en /contacto. Reusa la API de leads
// (POST /api/leads) para registrar cada submission como lead con
// fuente='contacto_formulario'. El lead queda visible en /admin/leads.
//
// Campos alineados con LeadModal para que la columna `mensaje` y demas
// se pueblen igual en BD y las fuentes sean comparables en el dashboard.
export default function ContactoForm() {
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    mensaje: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ whatsappUrl: string | null } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fuente: 'contacto_formulario' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar tu mensaje');

      setSuccess({ whatsappUrl: data.whatsapp_url || null });
      setForm({ nombre: '', empresa: '', email: '', telefono: '', mensaje: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setLoading(false);
    }
  };

  // Estado de exito: mantenemos visible la confirmacion + CTA a WhatsApp
  // si esta configurado (mismo comportamiento que LeadModal para no perder
  // el momento del contacto).
  if (success) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50/60 p-8 text-center">
        <div className="mx-auto inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="mt-4 text-xl font-bold text-slate-900">Gracias por escribirnos</h3>
        <p className="mt-2 text-sm text-slate-600">
          Recibimos tu mensaje. Un asesor te contactará a la mayor brevedad.
        </p>
        {success.whatsappUrl && (
          <a
            href={success.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-green-700"
          >
            Continuar por WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-4 block mx-auto text-xs text-slate-500 hover:text-slate-700"
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-4"
    >
      <div>
        <h3 className="text-xl font-bold text-slate-900">Escríbenos</h3>
        <p className="mt-1 text-sm text-slate-500">
          Completa el formulario y un asesor se pondrá en contacto contigo.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            minLength={2}
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Tu nombre completo"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Empresa</label>
          <input
            type="text"
            value={form.empresa}
            onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Nombre de tu empresa"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="correo@empresa.com"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
          <input
            type="tel"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Opcional"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Mensaje</label>
        <textarea
          rows={4}
          value={form.mensaje}
          onChange={(e) => setForm((f) => ({ ...f, mensaje: e.target.value }))}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          placeholder="¿En qué podemos ayudarte?"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-slate-900 shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {loading ? 'Enviando...' : 'Enviar mensaje'}
      </button>

      <p className="text-[11px] text-slate-400 text-center">
        Al enviar aceptas nuestra{' '}
        <a href="/privacidad" className="underline hover:text-slate-600">
          política de privacidad
        </a>
        .
      </p>
    </form>
  );
}
