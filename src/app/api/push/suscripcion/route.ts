import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { getPushAdmin, getPushPublicKey, isPushConfigured } from '@/lib/push/push.server';
import { parsePushSubscription, PUSH_MIGRATION_MESSAGE } from '@/lib/push/shared';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };
const PORTAL_ROLES = ['super_admin', 'direccion', 'asesor', 'compras', 'comprador', 'aprobador', 'editor_contenido'] as const;

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: HEADERS });
const isMissingTable = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01';

export async function GET() {
  const auth = await authorizeApiRoles(PORTAL_ROLES);
  if (auth instanceof NextResponse) return auth;
  return json({ configured: isPushConfigured(), publicKey: getPushPublicKey() });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRoles(PORTAL_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!isPushConfigured()) return json({ error: 'Las notificaciones push aún no están configuradas en el servidor.' }, 503);
  const body = await request.json().catch(() => null) as { subscription?: unknown } | null;
  const subscription = parsePushSubscription(body?.subscription);
  if (!subscription) return json({ error: 'La suscripción del dispositivo no es válida.' }, 400);
  const { error } = await getPushAdmin().from('push_suscripciones').upsert({
    usuario_id: auth.actor.id, endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth,
    user_agent: request.headers.get('user-agent')?.slice(0, 300) || null, activo: true, ultimo_error: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return json({ error: isMissingTable(error) ? PUSH_MIGRATION_MESSAGE : 'No se pudo guardar la suscripción.' }, isMissingTable(error) ? 503 : 500);
  return json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeApiRoles(PORTAL_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== 'string' || !body.endpoint) return json({ error: 'Falta el dispositivo a desactivar.' }, 400);
  const { error } = await getPushAdmin().from('push_suscripciones').update({ activo: false, updated_at: new Date().toISOString() })
    .eq('endpoint', body.endpoint).eq('usuario_id', auth.actor.id);
  if (error) return json({ error: isMissingTable(error) ? PUSH_MIGRATION_MESSAGE : 'No se pudo desactivar el dispositivo.' }, isMissingTable(error) ? 503 : 500);
  return json({ ok: true });
}
