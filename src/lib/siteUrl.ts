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
 * sitemap.xml, llms.txt, canonical SEO, agent-ready discovery, etc.
 *
 * Orden de resolución (de mayor a menor prioridad):
 *   1. SITE_CANONICAL_URL — override explícito DEDICADO al canonical público
 *      (usalo si alguna vez querés forzar un dominio distinto en prod).
 *   2. VERCEL_ENV === 'production'  →  PRODUCTION_SITE_URL
 *      CRÍTICO: este nivel gana sobre APP_URL / NEXT_PUBLIC_APP_URL porque
 *      esas envs pueden estar apuntando al subdominio del portal B2B
 *      (b2b.imprima.com.co), no al canónico público.
 *   3. APP_URL / NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL — solo fuera
 *      de producción (útil para preview deploys customizados).
 *   4. https://<VERCEL_URL> — preview deploys de Vercel por defecto.
 *   5. http://localhost:3000 — desarrollo local.
 *
 * Sin barra final.
 */
export function getSiteUrl(): string {
  // 1. Override canonical explícito
  const canonicalOverride = process.env.SITE_CANONICAL_URL?.trim();
  if (canonicalOverride) {
    return canonicalOverride.replace(/\/+$/, '');
  }

  // 2. Producción Vercel: siempre el dominio público canónico.
  if (process.env.VERCEL_ENV === 'production') {
    return PRODUCTION_SITE_URL;
  }

  // 3. Env vars de app (preview / dev)
  const appUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (appUrl) {
    return appUrl.replace(/\/+$/, '');
  }

  // 4. VERCEL_URL en preview
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return 'https://' + vercelUrl.replace(/\/+$/, '');
  }

  // 5. Dev local
  return 'http://localhost:3000';
}
