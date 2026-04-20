'use client';

import { CategoriasEditor } from './CategoriasEditor';
import { ClientesEditor } from './ClientesEditor';
import { CtaFinalEditor } from './CtaFinalEditor';
import { EficienciaEditor } from './EficienciaEditor';
import { FooterEditor } from './FooterEditor';
import { HeroEditor } from './HeroEditor';
import { TestimoniosEditor } from './TestimoniosEditor';
import { WhatsAppEditor } from './WhatsAppEditor';

// Orquestador del tab "Landing" con todas las secciones del home + WhatsApp.
export function LandingEditor() {
  return (
    <div className="space-y-4">
      <HeroEditor />
      <CategoriasEditor />
      <EficienciaEditor />
      <ClientesEditor />
      <TestimoniosEditor />
      <CtaFinalEditor />
      <FooterEditor />
      <WhatsAppEditor />
    </div>
  );
}
