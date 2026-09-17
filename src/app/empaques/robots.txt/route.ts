import { NextResponse } from 'next/server';
import { EMPAQUES_CANONICAL_ORIGIN } from '@/lib/empaques/seo';

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 3600;

/**
 * robots.txt del subdominio de Empaques. El proxy reescribe
 * empaques.imprima.com.co/robots.txt hacia esta ruta para que el storefront
 * declare su propio sitemap y host canónico, separado del sitio corporativo.
 */
export async function GET() {
  const host = EMPAQUES_CANONICAL_ORIGIN.replace(/^https?:\/\//, '');
  const cuerpo = [
    'User-Agent: *',
    'Allow: /',
    'Disallow: /dashboard/',
    'Disallow: /api/internal/',
    'Disallow: /api/auth/',
    'Disallow: /api/odoo/',
    'Disallow: /login',
    '',
    '# Content Signals — https://contentsignals.org/',
    'Content-Signal: ai-train=yes, search=yes, ai-input=yes',
    '',
    `Sitemap: ${EMPAQUES_CANONICAL_ORIGIN}/sitemap.xml`,
    `Host: ${host}`,
    '',
  ].join('\n');

  return new NextResponse(cuerpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
