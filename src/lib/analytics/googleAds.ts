import { EMPAQUES_ADS_HOST, isEmpaquesAdsSurface } from './adsScope';

export const GOOGLE_ADS_ID = 'AW-17631992798';
export const GOOGLE_ADS_SEND_TO = 'AW-17631992798/Vc9FCIf83KgbEN63y9dB';
export const GOOGLE_ADS_SCRIPT_URL = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
const SENT_KEY = 'imprima_empaques_ads_dispatched_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

export type AdsTrackingContext = { hostname: string; protocol: string; pathname: string };
export type LeadReceipt = { ok: boolean; leadId: unknown };
type Conversion = { send_to: string; value: number; currency: string; transaction_id: string };
type GoogleWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && UUID.test(value);
}

export function buildGoogleAdsConversion(receipt: LeadReceipt): Conversion | null {
  if (receipt.ok !== true || !validId(receipt.leadId)) return null;
  return { send_to: GOOGLE_ADS_SEND_TO, value: 1, currency: 'COP', transaction_id: receipt.leadId.toLowerCase() };
}

export function canDispatchGoogleAds(context: AdsTrackingContext): boolean {
  return context.hostname === EMPAQUES_ADS_HOST && context.protocol === 'https:'
    && isEmpaquesAdsSurface(context.hostname, context.pathname);
}

export function createLeadConversionTracker(options: {
  context: () => AdsTrackingContext;
  dispatch: (event: Conversion) => void;
  dispatchedIds?: string[];
  saveDispatched?: (ids: string[]) => void;
}) {
  let ready = false;
  const sent = new Set((options.dispatchedIds ?? []).filter(validId).map((id) => id.toLowerCase()).slice(-MAX_IDS));
  const pending = new Map<string, Conversion>();
  const flush = () => {
    if (!canDispatchGoogleAds(options.context())) { pending.clear(); return; }
    if (!ready) return;
    for (const [id, event] of pending) {
      try {
        options.dispatch(event);
      } catch {
        return;
      }
      pending.delete(id);
      sent.add(id);
      if (sent.size > MAX_IDS) sent.delete(sent.values().next().value!);
      try { options.saveDispatched?.([...sent]); } catch {}
    }
  };
  return {
    report(receipt: LeadReceipt) {
      const event = buildGoogleAdsConversion(receipt);
      if (!event || !canDispatchGoogleAds(options.context()) || sent.has(event.transaction_id) || pending.size >= MAX_IDS) return;
      pending.set(event.transaction_id, event);
      flush();
    },
    markReady() { ready = true; flush(); },
    reset() { ready = false; pending.clear(); sent.clear(); },
  };
}

function browserContext(): AdsTrackingContext {
  return { hostname: window.location.hostname, protocol: window.location.protocol, pathname: window.location.pathname };
}

let tracker: ReturnType<typeof createLeadConversionTracker> | null = null;
let bootstrapped = false;
let configured = false;
let scriptReady = false;

function getTracker() {
  if (!tracker) {
    let ids: string[] = [];
    try {
      const stored = window.sessionStorage.getItem(SENT_KEY);
      if (stored && stored.length < 5000) {
        const data = JSON.parse(stored);
        if (Array.isArray(data)) ids = data.filter(validId);
      }
    } catch {}
    tracker = createLeadConversionTracker({
      context: browserContext,
      dispatchedIds: ids,
      saveDispatched: (values) => window.sessionStorage.setItem(SENT_KEY, JSON.stringify(values)),
      dispatch: (payload) => {
        const tag = (window as GoogleWindow).gtag;
        if (!tag) throw new Error('Etiqueta no disponible.');
        tag('set', { page_location: safeGoogleAdsPageLocation(window.location.href) });
        tag('event', 'conversion', payload);
      },
    });
  }
  return tracker;
}

export function createGoogleTagQueue(dataLayer: unknown[]) {
  return function () { dataLayer.push(arguments.valueOf()); } as (...args: unknown[]) => void;
}

export function safeGoogleAdsPageLocation(raw: string): string {
  const url = new URL(raw);
  const params = new URLSearchParams();
  for (const key of ['gclid', 'gbraid', 'wbraid']) {
    const value = url.searchParams.get(key);
    if (value && /^[a-zA-Z0-9_-]{1,500}$/.test(value)) params.set(key, value);
  }
  for (const key of ['categoria', 'page']) {
    const value = url.searchParams.get(key);
    if (value && /^[1-9]\d{0,9}$/.test(value)) params.set(key, value);
  }
  const query = params.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
}

export function prepareEmpaquesGoogleAds(): boolean {
  if (typeof window === 'undefined' || !canDispatchGoogleAds(browserContext())) return false;
  const target = window as GoogleWindow;
  target.dataLayer ??= [];
  target.gtag ??= createGoogleTagQueue(target.dataLayer);
  if (!bootstrapped) {
    target.gtag('js', new Date());
    bootstrapped = true;
  }
  if (scriptReady) activateEmpaquesGoogleAds();
  return true;
}

export function activateEmpaquesGoogleAds() {
  if (typeof window === 'undefined') return;
  scriptReady = true;
  if (!canDispatchGoogleAds(browserContext())) return;
  const tag = (window as GoogleWindow).gtag;
  if (!tag) return;
  if (!configured) {
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch {}
    tag('set', { page_location: safeGoogleAdsPageLocation(window.location.href), page_referrer: referrer });
    tag('config', GOOGLE_ADS_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      allow_enhanced_conversions: false,
      cookie_domain: EMPAQUES_ADS_HOST,
    });
    configured = true;
  }
  getTracker().markReady();
}

export function suspendEmpaquesGoogleAds() {
  tracker?.reset();
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(SENT_KEY); } catch {}
}

export function reportEmpaquesLeadConversion(receipt: LeadReceipt) {
  if (typeof window === 'undefined') return;
  try {
    if (!canDispatchGoogleAds(browserContext())) return;
    getTracker().report(receipt);
  } catch {}
}
