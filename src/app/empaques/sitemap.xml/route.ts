import { NextResponse } from 'next/server';
import {
  EMPAQUES_CANONICAL_ORIGIN,
  buildEmpaquesHomeCanonical,
  buildEmpaquesPersonalizadosCanonical,
  buildEmpaquesProductCanonical,
} from '@/lib/empaques/seo';
import { loadEmpaquesSiteIndex } from '@/lib/empaques/site-index';

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 3600;

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * sitemap.xml del subdominio de Empaques: home, personalizados, categorías
 * visibles y fichas de producto publicadas, siempre con URLs canónicas del
 * subdominio. El proxy reescribe empaques.imprima.com.co/sitemap.xml aquí.
 * Si Odoo falla se sirven solo las rutas estáticas en vez de romper.
 */
export async function GET() {
  const urls: Array<{ loc: string; priority: string }> = [
    { loc: `${EMPAQUES_CANONICAL_ORIGIN}/`, priority: '1.0' },
    { loc: buildEmpaquesPersonalizadosCanonical(), priority: '0.9' },
  ];

  try {
    const index = await loadEmpaquesSiteIndex();
    for (const category of index.categories) {
      urls.push({ loc: buildEmpaquesHomeCanonical(category.id), priority: '0.8' });
    }
    for (const product of index.products) {
      urls.push({ loc: buildEmpaquesProductCanonical(product.id), priority: '0.6' });
    }
  } catch {
    // Catálogo no disponible: el sitemap estático sigue siendo válido.
  }

  const cuerpo = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url.loc)}</loc><priority>${url.priority}</priority></url>`),
    '</urlset>',
    '',
  ].join('\n');

  return new NextResponse(cuerpo, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
