/**
 * Atribución de leads: captura y lectura del gclid + parámetros UTM
 * que llegan por query string cuando un visitante entra al sitio.
 *
 * Estrategia:
 *   - Al cargar cualquier página pública, si la URL trae alguno de
 *     estos parámetros, los guardamos en una cookie first-party
 *     `lead_attr` con expiración de 90 días.
 *   - Nunca sobreescribimos una cookie existente con una entrada
 *     "vacía": si el visitante ya tenía gclid y entra a otra página
 *     interna sin query params, la atribución original se preserva.
 *   - Google Ads recomienda retener la atribución entre 30 y 90
 *     días; usamos 90 porque el ciclo de decisión B2B es largo
 *     (cotización → aprobación → compra).
 *
 * Este módulo es puramente de cliente. La lectura ocurre tanto al
 * capturar como al enviar el formulario. El servidor persiste los
 * datos a través del payload del POST /api/leads.
 */

export interface LeadAttribution {
  gclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_url?: string;
  // ISO-8601 timestamp del momento en que se capturó el click.
  // Necesario para Google Ads Conversion API: el conversion_date_time
  // debe ser posterior o igual al click_date_time de la conversión.
  click_at?: string;
}

const COOKIE_NAME = 'lead_attr';
const COOKIE_MAX_AGE_DAYS = 90;

const ATTRIBUTION_KEYS: Array<keyof LeadAttribution> = [
  'gclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
  'landing_url',
  'click_at',
];

/** Lee la cookie de atribución. Devuelve objeto vacío si no existe. */
export function readLeadAttributionCookie(): LeadAttribution {
  if (typeof document === 'undefined') return {};
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return {};
  try {
    const raw = decodeURIComponent(match.split('=')[1] ?? '');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attr: LeadAttribution = {};
    for (const key of ATTRIBUTION_KEYS) {
      const val = parsed[key];
      if (typeof val === 'string' && val.length > 0 && val.length <= 500) {
        (attr as Record<string, string>)[key] = val;
      }
    }
    return attr;
  } catch {
    // Cookie corrupta: la tratamos como ausente.
    return {};
  }
}

/**
 * Escribe la cookie con los datos de atribución pasados.
 * Merge-friendly: si ya hay cookie, solo sobreescribe los campos
 * nuevos que vengan con valor (no borra los previos).
 */
function writeLeadAttributionCookie(partial: LeadAttribution) {
  if (typeof document === 'undefined') return;
  const current = readLeadAttributionCookie();
  const merged: LeadAttribution = { ...current };
  for (const key of ATTRIBUTION_KEYS) {
    const val = partial[key];
    if (typeof val === 'string' && val.length > 0) {
      (merged as Record<string, string>)[key] = val;
    }
  }
  // Si tras el merge no hay nada útil, no escribimos cookie.
  if (Object.keys(merged).length === 0) return;

  const value = encodeURIComponent(JSON.stringify(merged));
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Captura desde la URL actual (y document.referrer) cualquier dato
 * de atribución nuevo y lo persiste en cookie. Idempotente: llamar
 * varias veces no duplica ni pierde información.
 *
 * Regla: si la URL actual trae gclid o algún utm_*, se considera
 * "evento de atribución nuevo" y se registra tanto la landing_url
 * como el click_at. Si no trae nada, solo se preserva la cookie
 * existente.
 */
export function captureLeadAttributionFromUrl(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const params = url.searchParams;

  const captured: LeadAttribution = {};
  const gclid = params.get('gclid');
  if (gclid) captured.gclid = gclid;

  const utmKeys: Array<keyof LeadAttribution> = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ];
  for (const key of utmKeys) {
    const val = params.get(key);
    if (val) (captured as Record<string, string>)[key] = val;
  }

  const hasNewAttribution = Object.keys(captured).length > 0;
  if (!hasNewAttribution) return;

  // Guardamos contexto adicional solo cuando registramos atribución
  // fresca. Esto garantiza que click_at corresponde al click real
  // del anuncio, no a una navegación interna posterior.
  captured.landing_url = url.href;
  captured.click_at = new Date().toISOString();
  if (document.referrer) {
    captured.referrer = document.referrer;
  }

  writeLeadAttributionCookie(captured);
}
