import { NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { safeSendPushToUsers } from '@/lib/push/push.server';
import { buildPushPayload } from '@/lib/push/shared';

export const dynamic = 'force-dynamic';

const PORTAL_ROLES = ['super_admin', 'direccion', 'asesor', 'compras', 'comprador', 'aprobador', 'editor_contenido'] as const;

export async function POST() {
  const auth = await authorizeApiRoles(PORTAL_ROLES);
  if (auth instanceof NextResponse) return auth;
  const result = await safeSendPushToUsers([{
    usuarioId: auth.actor.id,
    payload: buildPushPayload({ title: 'Notificaciones activas', body: 'Así te avisaremos de pedidos, aprobaciones y novedades del portal.', url: '/dashboard/perfil', tag: 'prueba' }),
  }]);
  const status = result.sent > 0 ? 200 : 409;
  const error = result.sent > 0 ? null : result.skipped ?? 'No hay dispositivos activos para este usuario. Activa las notificaciones en este dispositivo.';
  return NextResponse.json({ ...result, error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
