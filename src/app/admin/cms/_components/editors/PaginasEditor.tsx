'use client';

import { PaginaContactoEditor } from './PaginaContactoEditor';
import { PaginaFaqEditor } from './PaginaFaqEditor';
import { PaginaNosotrosEditor } from './PaginaNosotrosEditor';
import { PaginaTextoLargoEditor } from './PaginaTextoLargoEditor';

// Orquestador de todas las páginas estáticas del sitio.
// Mantiene el orden exacto del editor monolítico original.
export function PaginasEditor() {
  return (
    <div className="space-y-4">
      <PaginaNosotrosEditor />
      <PaginaContactoEditor />
      <PaginaFaqEditor />
      <PaginaTextoLargoEditor id="pagina_terminos" />
      <PaginaTextoLargoEditor id="pagina_privacidad" />
    </div>
  );
}
