/**
 * URL base pública del sitio. Se usa para construir URLs absolutas en
 * robots.txt, sitemap.xml, llms.txt, metadata canonical, etc.
 *
 * Orden de resolución:
 *   1. APP_URL (server-side)
 *   2. NEXT_PUBLIC_APP_URL
 *   3. NEXT_PUBLIC_SITE_URL
 *   4. VERCEL_URL (fallback durante preview deploys)
 *   5. http://localhost:3000 (desarrollo)
 *
 * Sin barra final.
 */
export function getSiteUrl(): string {
  const explicit =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return 'https://' + vercelUrl.replace(/\/+$/, '');
  }

  return 'http://localhost:3000';
}

/**
 * URL canónica pública de producción. Usar cuando necesitamos la URL real
 * aunque estemos en un preview (ej. canonical SEO, llms.txt).
 */
export const PRODUCTION_SITE_URL = 'https://imprima.com.co';
