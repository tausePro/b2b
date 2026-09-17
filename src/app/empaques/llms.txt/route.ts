import { NextResponse } from 'next/server';
import { getEmpaquesLandingConfig } from '@/lib/empaques/landing-config';
import { DEFAULT_LANDING_CONFIG } from '@/lib/empaques/landing-config-shared';
import {
  EMPAQUES_CANONICAL_ORIGIN,
  buildEmpaquesHomeCanonical,
  buildEmpaquesPersonalizadosCanonical,
  buildEmpaquesProductCanonical,
} from '@/lib/empaques/seo';
import { loadEmpaquesSiteIndex } from '@/lib/empaques/site-index';

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 300;

/**
 * /llms.txt del subdominio de Empaques (estándar https://llmstxt.org).
 * Describe el storefront real: categorías visibles, productos publicados y el
 * configurador de personalizados, sin mezclar el catálogo corporativo B2B.
 */
export async function GET() {
  const landing = await getEmpaquesLandingConfig().catch(() => DEFAULT_LANDING_CONFIG);
  const lineas: string[] = [
    '# Empaques Imprima',
    '',
    `> ${landing.hero.subtitulo || 'Soluciones de empaque para empresas en Colombia: bolsas kraft, empaques reciclables y personalización con impresión CMYK.'}`,
    '',
    'Empaques es la unidad de negocio de Imprima S.A.S dedicada a soluciones de empaque. El catálogo se sincroniza con el ERP y los precios publicados son antes de IVA; las solicitudes se atienden con asesoría comercial.',
    '',
    '## Páginas principales',
    '',
    `- [Catálogo de Empaques](${EMPAQUES_CANONICAL_ORIGIN}/): categorías y productos disponibles con precio de referencia.`,
    `- [Empaques personalizados](${buildEmpaquesPersonalizadosCanonical()}): impresión CMYK sobre bolsas kraft; una o dos caras con un TIFF por cara.`,
    `- [Contacto](https://imprima.com.co/contacto): canales de atención de Imprima.`,
    '',
  ];

  try {
    const index = await loadEmpaquesSiteIndex();
    if (index.categories.length > 0) {
      lineas.push('## Categorías');
      lineas.push('');
      for (const category of index.categories) {
        const description = category.descripcion_corta ? `: ${category.descripcion_corta}` : '';
        lineas.push(`${'  '.repeat(Math.max(0, category.level))}- [${category.name}](${buildEmpaquesHomeCanonical(category.id)})${description}`);
      }
      lineas.push('');
    }
    if (index.products.length > 0) {
      lineas.push(`## Productos publicados (${index.totalProducts})`);
      lineas.push('');
      for (const product of index.products) {
        const reference = typeof product.default_code === 'string' && product.default_code ? ` — ref. ${product.default_code}` : '';
        lineas.push(`- [${product.name}](${buildEmpaquesProductCanonical(product.id)})${reference}`);
      }
      if (index.truncated) lineas.push(`- El catálogo completo está en ${EMPAQUES_CANONICAL_ORIGIN}/sitemap.xml`);
      lineas.push('');
    }
  } catch {
    lineas.push('El listado de productos no está disponible temporalmente; consulta el catálogo en línea.');
    lineas.push('');
  }

  lineas.push('## Optional');
  lineas.push('');
  lineas.push(`- [Sitemap](${EMPAQUES_CANONICAL_ORIGIN}/sitemap.xml)`);
  lineas.push('- [Términos y condiciones](https://imprima.com.co/terminos)');
  lineas.push('- [Política de privacidad](https://imprima.com.co/privacidad)');
  lineas.push('');

  return new NextResponse(lineas.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      'Content-Signal': 'ai-train=yes, search=yes, ai-input=yes',
    },
  });
}
