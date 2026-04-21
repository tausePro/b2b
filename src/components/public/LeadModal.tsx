'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, MessageCircle } from 'lucide-react';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  fuente?: string;
  ctaTexto?: string;
  // Texto que aparece prellenado en el textarea "mensaje". El usuario
  // puede editarlo antes de enviar. El API /api/leads ya prioriza
  // form.mensaje sobre el mensaje_default global, asi que esto se
  // propaga automaticamente al WhatsApp final.
  mensajePrefill?: string;
  // Numero de WhatsApp destino override (sin formato). Si se pasa,
  // el backend redirige el enlace wa.me a este numero en vez del
  // global configurado en config_whatsapp. Caso de uso principal:
  // tarjeta de una comercial del equipo en /contacto.
  numeroOverride?: string;
}

export default function LeadModal({
  isOpen,
  onClose,
  fuente = 'landing',
  ctaTexto = 'Hablar con un asesor',
  mensajePrefill,
  numeroOverride,
}: LeadModalProps) {
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    mensaje: mensajePrefill ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cuando el modal se abre (o cambia el prefill), reiniciamos el
  // textarea al prefill. Asi cada apertura empieza con el mensaje
  // sugerido para esa fuente (cotizacion, contacto generico, etc.).
  useEffect(() => {
    if (isOpen) {
      setForm((prev) => ({ ...prev, mensaje: mensajePrefill ?? '' }));
    }
  }, [isOpen, mensajePrefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fuente,
          // Si hay override de numero, el backend construye wa.me contra
          // este valor en vez del global. Campo vacio/undefined = flujo
          // por defecto (numero global).
          numero_whatsapp_override: numeroOverride,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank');
      }

      setForm({ nombre: '', empresa: '', email: '', telefono: '', mensaje: mensajePrefill ?? '' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">{ctaTexto}</h3>
          <p className="text-sm text-slate-500 mt-1">Completa tus datos y te conectamos por WhatsApp</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre *</label>
            <input
              type="text"
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Tu nombre completo"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Empresa</label>
            <input
              type="text"
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              placeholder="Nombre de tu empresa"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="tu@email.com"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="+57 300..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">¿En qué podemos ayudarte?</label>
            <textarea
              value={form.mensaje}
              onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
              placeholder="Cuéntanos brevemente tu necesidad..."
              rows={2}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4" />
            )}
            {loading ? 'Enviando...' : 'Enviar y abrir WhatsApp'}
          </button>
        </form>
      </div>
    </div>
  );
}
