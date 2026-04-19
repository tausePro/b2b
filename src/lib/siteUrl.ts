/**
 * URL canónica pública de producción.
 * El sitio tiene dos dominios:
 *   - imprima.com.co      → landing pública (SEO, agent-ready, marketing)
 *   - b2b.imprima.com.co  → portal B2B (login, dashboard, admin)
 * Los archivos agent-ready (robots.txt, sitemap, llms.txt, canonical) deben
 * apuntar siempre al canonical público, no al subdominio del portal.
 */
export const PRODUCTION_SITE_URL = 'https://imprima.com.co';

/**
 * URL base pública del sitio para construir URLs absolutas en robots.txt,
 * sitemap.xml, llms.txt, canonical SEO, etc.
 *
 * Orden de resolución:
 *   1. SITE_CANONICAL_URL (env explícita, mayor prioridad)
 *   2. APP_URL / NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL (server-side)
 *   3. PRODUCTION_SITE_URL si VERCEL_ENV=production (evita que Vercel use
 *      el subdominio del deploy en las URLs canónicas)
 *   4. https://<VERCEL_URL> en preview deploys
 *   5. http://localhost:3000 en desarrollo
 *
 * Sin barra final.
 */
export function getSiteUrl(): string {
  const explicit =
    process.env.SITE_CANONICAL_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  // En producción Vercel: SIEMPRE usar el dominio público canónico.
  // Evita que VERCEL_URL devuelva el subdominio del deploy o b2b.*
  if (process.env.VERCEL_ENV === 'production') {
    return PRODUCTION_SITE_URL;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return 'https://' + vercelUrl.replace(/\/+$/, '');
  }

  return 'http://localhost:3000';
}
