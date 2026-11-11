import 'server-only';

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { isGonePushStatus, type PushPayload } from './shared';

export interface PushMessage { usuarioId: string; payload: PushPayload }
export interface PushSendResult { sent: number; failed: number; removed: number; skipped: string | null }

let vapidReady = false;

export function getPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export function getPushAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function sendPushToUsers(messages: readonly PushMessage[]): Promise<PushSendResult> {
  if (messages.length === 0) return { sent: 0, failed: 0, removed: 0, skipped: null };
  if (!isPushConfigured()) return { sent: 0, failed: 0, removed: 0, skipped: 'Notificaciones push sin llaves VAPID configuradas.' };
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  }
  const admin = getPushAdmin();
  const { data, error } = await admin.from('push_suscripciones').select('id, usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', [...new Set(messages.map(message => message.usuarioId))]).eq('activo', true);
  if (error) return { sent: 0, failed: 0, removed: 0, skipped: error.message };
  const byUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  for (const row of data ?? []) byUser.set(row.usuario_id, [...(byUser.get(row.usuario_id) ?? []), row]);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(messages.flatMap(message => (byUser.get(message.usuarioId) ?? []).map(async subscription => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(message.payload),
        { TTL: 24 * 60 * 60, urgency: 'normal', timeout: 5000 },
      );
      sent++;
    } catch (sendError) {
      if (isGonePushStatus((sendError as { statusCode?: number }).statusCode)) gone.push(subscription.id);
      else failed++;
    }
  })));
  if (gone.length > 0) {
    await admin.from('push_suscripciones').update({ activo: false, ultimo_error: 'Suscripción vencida o revocada (404/410).', updated_at: new Date().toISOString() }).in('id', gone);
  }
  return { sent, failed, removed: gone.length, skipped: null };
}

/** Variante segura: un fallo de push nunca bloquea el pedido, el lead ni el correo. */
export async function safeSendPushToUsers(messages: readonly PushMessage[]): Promise<PushSendResult> {
  try {
    return await sendPushToUsers(messages);
  } catch (error) {
    console.error('[push] No se pudieron enviar notificaciones push:', error instanceof Error ? error.message : error);
    return { sent: 0, failed: messages.length, removed: 0, skipped: 'error' };
  }
}

export async function loadActiveRoleUserIds(role: string): Promise<string[]> {
  const admin = getPushAdmin();
  const [primary, extra] = await Promise.all([
    admin.from('usuarios').select('id').eq('rol', role).eq('activo', true),
    admin.from('usuario_roles_extra').select('usuario_id, usuarios!inner(activo)').eq('rol', role).eq('activo', true).eq('usuarios.activo', true),
  ]);
  return [...new Set([
    ...(primary.data ?? []).map(row => String(row.id)),
    ...(extra.data ?? []).map(row => String(row.usuario_id)),
  ])];
}
