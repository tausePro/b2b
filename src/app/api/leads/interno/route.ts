import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { userHasAnyRole } from '@/lib/auth/roles';
import { LEAD_ID_PATTERN } from '@/lib/leads-query';
import { MANUAL_LEAD_SOURCE } from '@/lib/leads/seguimiento';
import { LEAD_TRACKING_MIGRATION_MESSAGE, leadTrackingEnabled, loadLeadAdvisors, recordLeadEvents } from '@/lib/leads/seguimiento.server';
import { LeadValidationError, validateLeadContact } from '@/lib/leads/validation';
import { safeSendPushToUsers } from '@/lib/push/push.server';
import { buildPushPayload } from '@/lib/push/shared';

export const dynamic = 'force-dynamic';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/**
 * Registro manual de un lead desde el portal (prospección de las asesoras). La asesora queda asignada a su lead;
 * Dirección, Super Admin y Editor pueden asignarlo a una asesora o dejarlo sin asignar. No envía correos de aviso.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeApiRoles(['super_admin', 'direccion', 'editor_contenido', 'asesor']);
  if (auth instanceof NextResponse) return auth;
  const fullAccess = userHasAnyRole(auth.actor, ['super_admin', 'direccion', 'editor_contenido']);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Solicitud inválida.' }, 400);
  try {
    const contact = validateLeadContact({ nombre: body.nombre, empresa: body.empresa, email: body.email, telefono: body.telefono, mensaje: body.mensaje });
    if (!await leadTrackingEnabled()) return json({ error: LEAD_TRACKING_MIGRATION_MESSAGE }, 409);
    // Estado inicial: si la asesora ya habló con el prospecto lo registra como contactado.
    const estado = body.estado === 'contactado' ? 'contactado' : 'nuevo';
    const requested = typeof body.asignado_a === 'string' && body.asignado_a ? body.asignado_a.toLowerCase() : null;
    if (requested && !LEAD_ID_PATTERN.test(requested)) return json({ error: 'Asesora inválida.' }, 400);
    const advisors = await loadLeadAdvisors();
    const assignee = fullAccess ? (requested ? advisors.find((advisor) => advisor.id === requested) ?? null : null) : advisors.find((advisor) => advisor.id === auth.actor.id) ?? null;
    if (fullAccess && requested && !assignee) return json({ error: 'Solo se puede asignar a una asesora activa.' }, 400);
    if (!fullAccess && !assignee) return json({ error: 'Tu usuario no está habilitado como asesora.' }, 403);

    // Evita que dos asesoras trabajen el mismo prospecto: avisa si ya existe un lead con ese correo o teléfono.
    const client = admin();
    const matches = [contact.email ? `email.eq."${contact.email}"` : null, contact.telefono ? `telefono.eq."${contact.telefono}"` : null].filter(Boolean).join(',');
    const { data: existing, error: existingError } = await client.from('leads').select('id, nombre, asignado_a, created_at')
      .or(matches).neq('estado', 'descartado').order('created_at', { ascending: false }).limit(1);
    if (existingError) throw existingError;
    if (existing?.[0]) {
      const owner = advisors.find((advisor) => advisor.id === existing[0].asignado_a)?.nombre;
      return json({ error: `Ya existe un lead con ese correo o teléfono (${existing[0].nombre}${owner ? `, asignado a ${owner}` : ', sin asignar'}). Pide a Dirección que lo asigne si te corresponde.` }, 409);
    }

    const { data: actor } = await client.from('usuarios').select('nombre, apellido').eq('id', auth.actor.id).maybeSingle();
    const actorName = [actor?.nombre, actor?.apellido].filter(Boolean).join(' ') || 'una asesora';
    const { data: lead, error } = await client.from('leads').insert({
      ...contact, fuente: MANUAL_LEAD_SOURCE, estado, contactado_at: estado === 'contactado' ? new Date().toISOString() : null,
      whatsapp_enviado: false, asignado_a: assignee?.id ?? null,
    }).select().single();
    if (error) throw error;
    await recordLeadEvents([
      {
        lead_id: lead.id, tipo: 'asignacion', usuario_id: auth.actor.id,
        detalle: assignee ? (assignee.id === auth.actor.id ? `Registrado por ${actorName}` : `Registrado por ${actorName} y asignado a ${assignee.nombre}`) : `Registrado por ${actorName}, sin asignar`,
      },
      ...(estado === 'contactado' ? [{ lead_id: lead.id, tipo: 'estado' as const, usuario_id: auth.actor.id, detalle: 'Registrado como contactado' }] : []),
    ]);
    if (assignee && assignee.id !== auth.actor.id) {
      await safeSendPushToUsers([{ usuarioId: assignee.id, payload: buildPushPayload({
        title: 'Te asignaron un lead', body: [lead.nombre, lead.empresa, lead.telefono].filter(Boolean).join(' · '),
        url: `/dashboard/leads?lead=${lead.id}`, tag: `lead-asignado-${lead.id}`,
      }) }]);
    }
    return json({ lead: { ...lead, asignado_nombre: assignee?.nombre ?? null } }, 201);
  } catch (error) {
    if (error instanceof LeadValidationError) return json({ error: error.message, field: error.field }, 400);
    console.error('[leads/interno]', error);
    return json({ error: 'No se pudo registrar el lead.' }, 500);
  }
}
