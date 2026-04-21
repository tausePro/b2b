'use client';

import { ComercialesEditor } from './ComercialesEditor';
import { PaginaContactoEditor } from './PaginaContactoEditor';
import { PaginaFaqEditor } from './PaginaFaqEditor';
import { PaginaNosotrosEditor } from './PaginaNosotrosEditor';
import { PaginaTextoLargoEditor } from './PaginaTextoLargoEditor';

// Orquestador de todas las páginas estáticas del sitio.
// Mantiene el orden exacto del editor monolítico original.
// `ComercialesEditor` se agrupa junto a `PaginaContactoEditor` porque
// ambos se renderizan en /contacto y el admin los va a editar juntos.
export function PaginasEditor() {
  return (
    <div className="space-y-4">
      <PaginaNosotrosEditor />
      <PaginaContactoEditor />
      <ComercialesEditor />
      <PaginaFaqEditor />
      <PaginaTextoLargoEditor id="pagina_terminos" />
      <PaginaTextoLargoEditor id="pagina_privacidad" />
    </div>
  );
}
