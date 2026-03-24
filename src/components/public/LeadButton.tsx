'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import LeadModal from './LeadModal';

interface LeadButtonProps {
  fuente?: string;
  texto?: string;
  className?: string;
  variant?: 'primary' | 'whatsapp' | 'outline';
}

export default function LeadButton({
  fuente = 'landing',
  texto = 'Hablar con un asesor',
  className = '',
  variant = 'whatsapp',
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
        <MessageCircle className="w-4 h-4" />
        {texto}
      </button>
      <LeadModal isOpen={open} onClose={() => setOpen(false)} fuente={fuente} ctaTexto={texto} />
    </>
  );
}
