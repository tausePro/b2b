'use client';

import { useState, useEffect } from 'react';
import LeadModal from './LeadModal';

interface WhatsAppConfig {
  numero: string;
  mensaje_default: string;
  cta_texto: string;
  activo: boolean;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.129 6.744 3.047 9.381L1.054 31.2l6.023-1.933A15.91 15.91 0 0016.004 32C24.826 32 32 24.824 32 16.004 32 7.176 24.826 0 16.004 0zm9.533 22.611c-.396 1.118-1.955 2.045-3.222 2.316-.868.183-2.002.329-5.818-1.25-4.885-2.023-8.027-6.965-8.27-7.291-.233-.326-1.955-2.605-1.955-4.968 0-2.363 1.237-3.524 1.676-4.005.396-.433 1.048-.62 1.672-.62.198 0 .376.01.536.019.44.019.66.045.95.736.362.863 1.243 3.03 1.353 3.249.113.22.226.516.079.826-.14.316-.264.456-.483.706-.22.25-.427.44-.647.71-.198.236-.423.49-.176.93.247.433 1.098 1.81 2.358 2.933 1.62 1.442 2.985 1.89 3.41 2.098.326.16.714.132.968-.147.322-.356.72-.947 1.126-1.53.289-.415.653-.468 1.013-.316.363.146 2.305 1.089 2.7 1.287.396.198.66.297.757.462.094.166.094.96-.302 2.079z" />
    </svg>
  );
}

export default function WhatsAppBubble() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  return (
    <>
      {/* Wrapper fixed para poder colocar el halo decorativo detras del
          boton sin afectar su area clickable. El halo usa animate-ping
          sutil (opacity baja) para llamar la atencion sin ser agresivo. */}
      <div className="fixed bottom-6 right-6 z-50">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-[#25D366]/40 blur-xl animate-pulse"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-[#25D366] opacity-40 animate-ping"
        />
        <button
          onClick={() => setShowModal(true)}
          aria-label={config.cta_texto || 'WhatsApp'}
          className="relative bg-[#25D366] hover:bg-[#1ebe57] text-white rounded-full p-4 shadow-lg shadow-[#25D366]/30 hover:shadow-xl hover:shadow-[#25D366]/40 ring-4 ring-white/60 transition-all hover:scale-110 group cursor-pointer"
        >
          <WhatsAppIcon className="w-7 h-7" />
          {/* Tooltip glass: white/80 + backdrop-blur en vez de blanco solido
              para que encaje con el resto del lenguaje visual del home. */}
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 backdrop-blur-md bg-white/85 border border-white/70 text-slate-800 text-sm font-semibold px-3 py-1.5 rounded-xl shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {config.cta_texto || 'Hablar con un asesor'}
          </span>
        </button>
      </div>
      <LeadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        fuente="whatsapp_bubble"
        ctaTexto={config.cta_texto || 'Hablar con un asesor'}
      />
    </>
  );
}
