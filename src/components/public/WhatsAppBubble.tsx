'use client';

import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';

interface WhatsAppConfig {
  numero: string;
  mensaje_default: string;
  cta_texto: string;
  activo: boolean;
}

export default function WhatsAppBubble() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);

  useEffect(() => {
    fetch('/api/landing/contenido')
      .then((res) => res.json())
      .then((data) => {
        const sec = data.contenido?.config_whatsapp;
        if (sec?.contenido) {
          const c = sec.contenido as WhatsAppConfig;
          if (c.activo && c.numero) {
            setConfig(c);
          }
        }
      })
      .catch(() => {});
  }, []);

  if (!config) return null;

  const numero = config.numero.replace(/[^0-9]/g, '');
  const mensaje = encodeURIComponent(config.mensaje_default || '');
  const url = `https://wa.me/${numero}?text=${mensaje}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={config.cta_texto || 'WhatsApp'}
      className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all hover:scale-110 group"
    >
      <MessageCircle className="w-7 h-7" />
      <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-white text-slate-800 text-sm font-semibold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {config.cta_texto || 'Hablar con un asesor'}
      </span>
    </a>
  );
}
