import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { isResendConfigured } from '@/lib/email/resend';
import { LEAD_NOTIFICATION_SETTINGS_ID, LEAD_NOTIFICATION_SETTINGS_TABLE, parseLeadNotificationSettings } from '@/lib/notifications/leadRecipients';

export const dynamic = 'force-dynamic';
const FIELDS = 'activo, destinatarios, updated_at';
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
const migrationMissing = (code: string | undefined) => code === 'PGRST205' || code === '42P01';

async function authorize() {
  const auth = await authorizeApiRoles(['super_admin']);
  if (auth instanceof NextResponse) return auth;
  return auth.actor.rol === 'super_admin' ? auth : response({ error: 'Acceso exclusivo de Super Admin.' }, 403);
}

export async function GET() {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.admin.from(LEAD_NOTIFICATION_SETTINGS_TABLE).select(FIELDS).eq('id', LEAD_NOTIFICATION_SETTINGS_ID).maybeSingle();
  if (migrationMissing(error?.code) || (!error && !data)) return response({ error: 'Aplica la migración 052 para habilitar la configuración privada de destinatarios.', code: 'MIGRATION_REQUIRED' }, 409);
  if (error) return response({ error: 'No se pudo cargar la configuración de destinatarios.' }, 500);
  return response({ settings: data, resendConfigured: isResendConfigured() });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize();
  if (auth instanceof NextResponse) return auth;
  let input;
  try { input = parseLeadNotificationSettings(await request.json()); }
  catch (error) { return response({ error: error instanceof Error ? error.message : 'Configuración inválida.' }, 400); }

  const { data, error } = await auth.admin.from(LEAD_NOTIFICATION_SETTINGS_TABLE)
    .update({ activo: input.activo, destinatarios: input.destinatarios, actualizado_por: auth.actor.authUserId, updated_at: new Date().toISOString() })
    .eq('id', LEAD_NOTIFICATION_SETTINGS_ID)
    .eq('updated_at', input.expected_updated_at)
    .select(FIELDS)
    .maybeSingle();
  if (migrationMissing(error?.code)) return response({ error: 'Aplica la migración 052 antes de guardar.', code: 'MIGRATION_REQUIRED' }, 409);
  if (error) return response({ error: 'No se pudo guardar la configuración de destinatarios.' }, 500);
  if (!data) return response({ error: 'La configuración cambió en otra sesión. Recárgala antes de guardar para no reemplazar esos cambios.', code: 'VERSION_CONFLICT' }, 409);
  return response({ settings: data, resendConfigured: isResendConfigured() });
}
