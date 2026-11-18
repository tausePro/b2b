import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadCommercialBoards } from '@/lib/comercial/tablero.server';
import { safeSendPushToUsers } from '@/lib/push/push.server';
import { buildPushPayload } from '@/lib/push/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const allowedSecrets = () => [...new Set([process.env.CRON_SECRET?.trim(), process.env.INTERNAL_EMAIL_PROCESSOR_SECRET?.trim()].filter((value): value is string => Boolean(value)))];

/**
 * Aviso diario del tablero comercial (cron de Vercel, 8 a. m. de Bogotá de lunes a viernes; ver vercel.json):
 * a cada asesora con alertas sin gestionar le llega un push con cuántos clientes tiene por contactar.
 */
export async function GET(request: NextRequest) {
  const secrets = allowedSecrets();
  if (secrets.length === 0) return NextResponse.json({ error: 'INTERNAL_SECRET_NOT_CONFIGURED' }, { status: 500 });
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  if (!token || !secrets.includes(token)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const boards = await loadCommercialBoards(admin, undefined, false);
    const messages = boards.flatMap((board) => {
      const pending = board.alerts.filter((alert) => !alert.lastAction && alert.alert?.level !== 'inactivo');
      if (pending.length === 0) return [];
      const priority = pending.filter((alert) => alert.alert?.level === 'prioritaria').length;
      return [{
        usuarioId: board.advisor.id,
        payload: buildPushPayload({
          title: 'Clientes por contactar hoy',
          body: `${pending.length} sin gestionar${priority ? ` (${priority} prioritarias)` : ''}. Empieza por ${pending[0].name}${pending[0].name.endsWith('.') ? '' : '.'}`,
          url: '/dashboard/tablero-comercial',
          tag: `alertas-comerciales-${board.today}`,
        }),
      }];
    });
    const result = messages.length ? await safeSendPushToUsers(messages) : { sent: 0, failed: 0, removed: 0, skipped: 'Sin alertas pendientes.' };
    return NextResponse.json({ ok: true, advisors: boards.length, notified: messages.length, result });
  } catch (error) {
    console.error('[internal/alertas-comerciales]', error);
    return NextResponse.json({ error: 'No se pudo preparar el aviso diario.' }, { status: 502 });
  }
}
