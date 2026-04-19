import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteUrl';
import { getPublicCatalogPageData } from '@/lib/catalogoPublico';
import type { PublicCatalogCategoryNode } from '@/types/publicCatalog';

function aplanarCategorias(nodos: PublicCatalogCategoryNode[]): PublicCatalogCategoryNode[] {
  const resultado: PublicCatalogCategoryNode[] = [];
  const recorrer = (lista: PublicCatalogCategoryNode[]): void => {
    for (const nodo of lista) {
      resultado.push(nodo);
      if (Array.isArray(nodo.children) && nodo.children.length > 0) {
        recorrer(nodo.children);
      }
    }
  };
  recorrer(nodos);
  return resultado;
}

/**
 * sitemap.xml dinámico.
 *
 * Incluye:
 *  - Rutas estáticas públicas (home, nosotros, contacto, faq, términos, privacidad).
 *  - Catálogo principal + páginas de categorías públicas (obtenidas vía cache de catálogo).
 *
 * El detalle de productos individuales lo dejamos para una iteración posterior
 * (sitemap index con generateSitemaps), ya que requiere paginar Odoo.
 */

type SitemapEntry = MetadataRoute.Sitemap[number];

const RUTAS_ESTATICAS: readonly { path: string; changeFrequency: SitemapEntry['changeFrequency']; priority: number }[] = [
  { path: '/',            changeFrequency: 'weekly',  priority: 1.0 },
  { path: '/nosotros',    changeFrequency: 'monthly', priority: 0.8 },
  { path: '/contacto',    changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq',         changeFrequency: 'monthly', priority: 0.6 },
  { path: '/catalogo',    changeFrequency: 'weekly',  priority: 0.9 },
  { path: '/terminos',    changeFrequency: 'yearly',  priority: 0.2 },
  { path: '/privacidad',  changeFrequency: 'yearly',  priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const now = new Date();

  const entradasEstaticas: SitemapEntry[] = RUTAS_ESTATICAS.map(({ path, changeFrequency, priority }) => ({
    url: baseUrl + path,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Categorías públicas (aplanadas, incluyendo subcategorías).
  let entradasCategorias: SitemapEntry[] = [];
  try {
    const { categories } = await getPublicCatalogPageData();
    if (Array.isArray(categories)) {
      const todas = aplanarCategorias(categories);
      entradasCategorias = todas.map((cat) => ({
        url: baseUrl + '/catalogo?categoria=' + encodeURIComponent(String(cat.id)),
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: Math.max(0.4, 0.7 - cat.level * 0.1),
      }));
    }
  } catch {
    // Si Odoo está caído el sitemap no debe romper. Servimos solo estáticas.
    entradasCategorias = [];
  }

  return [...entradasEstaticas, ...entradasCategorias];
}
