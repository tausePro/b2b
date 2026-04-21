'use client';

import { CatalogoBannerEditor } from './CatalogoBannerEditor';

// Orquestador del tab "Catalogo" con las secciones CMS relacionadas con la
// vista publica /catalogo. Se deja como contenedor explicito para que crecer
// en el futuro (banners por categoria, promos, etc.) no toque admin/cms/page.
export function CatalogoEditor() {
  return (
    <div className="space-y-4">
      <CatalogoBannerEditor />
    </div>
  );
}
