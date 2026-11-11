export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string }
export interface PushPayload { title: string; body: string; url: string; tag?: string }

export const PUSH_MIGRATION_MESSAGE = 'Falta la tabla de suscripciones push (migración 055). Ejecútala en Supabase para activar las notificaciones.';

export function parsePushSubscription(raw: unknown): PushSubscriptionInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };
  if (typeof value.endpoint !== 'string' || value.endpoint.length > 1000) return null;
  try {
    if (new URL(value.endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(p256dh)) return null;
  if (typeof auth !== 'string' || !/^[A-Za-z0-9_-]{16,32}={0,2}$/.test(auth)) return null;
  return { endpoint: value.endpoint, p256dh, auth };
}

export function buildPushPayload(input: { title: string | null | undefined; body?: string | null; url?: string | null; tag?: string | null }): PushPayload {
  const clean = (value: string | null | undefined, max: number) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const url = typeof input.url === 'string' && input.url.startsWith('/') && !input.url.startsWith('//') ? input.url : '/dashboard';
  const tag = clean(input.tag, 64);
  return { title: clean(input.title, 80) || 'Imprima B2B', body: clean(input.body, 180), url, ...(tag ? { tag } : {}) };
}

export function isGonePushStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
