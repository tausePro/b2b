'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import LeadModal from './LeadModal';

interface LeadButtonProps {
  fuente?: string;
  texto?: string;
  className?: string;
  variant?: 'primary' | 'whatsapp' | 'outline';
  // Mensaje que aparece prellenado en el textarea del modal.
  // El usuario puede editarlo antes de enviar. Se propaga al WhatsApp
  // final via /api/leads (que usa form.mensaje si viene lleno).
  mensajePrefill?: string;
  // Numero de WhatsApp destino override (sin formato). Si se pasa,
  // el lead se redirige a ese numero en vez del global (ej: tarjeta
  // de una comercial del equipo). Se sanitiza en el backend.
  numeroOverride?: string;
  // Permite ocultar el icono de MessageCircle cuando el boton se usa
  // dentro de una tarjeta que ya tiene su propia iconografia.
  hideIcon?: boolean;
}

export default function LeadButton({
  fuente = 'landing',
  texto = 'Hablar con un asesor',
  className = '',
  variant = 'whatsapp',
  mensajePrefill,
  numeroOverride,
  hideIcon = false,
}: LeadButtonProps) {
  const [open, setOpen] = useState(false);

  const baseStyles = 'inline-flex items-center gap-2 font-bold text-sm px-6 py-3 rounded-xl transition-all';
  const variants = {
    primary: `${baseStyles} bg-primary hover:bg-primary/90 text-slate-900 shadow-sm`,
    whatsapp: `${baseStyles} bg-green-600 hover:bg-green-700 text-white shadow-sm`,
    outline: `${baseStyles} border-2 border-slate-300 text-slate-700 hover:border-primary hover:text-primary`,
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${variants[variant]} ${className}`}>
        {!hideIcon && <MessageCircle className="w-4 h-4" />}
        {texto}
      </button>
      <LeadModal
        isOpen={open}
        onClose={() => setOpen(false)}
        fuente={fuente}
        ctaTexto={texto}
        mensajePrefill={mensajePrefill}
        numeroOverride={numeroOverride}
      />
    </>
  );
}
