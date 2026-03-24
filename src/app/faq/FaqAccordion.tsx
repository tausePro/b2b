'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FaqAccordionProps {
  items: Array<{ pregunta: string; respuesta: string }>;
}

export default function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={i} className="bg-white rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-800 pr-4">{item.pregunta}</span>
              <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed whitespace-pre-line border-t border-border pt-4">
                {item.respuesta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
