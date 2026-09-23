import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  getNotificationEmailTemplate,
  renderEditableNotificationTemplate,
} from '@/lib/notifications/emailTemplateStore';
import { processPendingEmailNotifications } from '@/lib/notifications/processPendingEmails';
import { LEAD_NOTIFICATION_SETTINGS_ID, LEAD_NOTIFICATION_SETTINGS_TABLE, recipientsFromPrivateSettings } from '@/lib/notifications/leadRecipients';

type LeadRow = {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  mensaje: string | null;
  fuente: string;
};

type LeadRecipient = { email: string; nombre: string | null };

type EnqueueLeadNotificationsResult = {
  emailCount: number;
  skippedReason: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECIPIENTS_CONFIG_ID = 'config_leads_notificaciones';
const MAX_RECIPIENTS = 10;

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizeRecipient(value: unknown): LeadRecipient | null {
  if (typeof value === 'string') {
    const email = value.trim().toLowerCase();
    return EMAIL_PATTERN.test(email) ? { email, nombre: null } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) return null;
  return {
    email,
    nombre: typeof row.nombre === 'string' && row.nombre.trim() ? row.nombre.trim() : null,
  };
}

/**
 * Destinatarios de avisos de leads. La fuente autoritativa es la fila
 * `config_leads_notificaciones` de landing_contenido (migración 051), con
 * LEADS_NOTIFICATION_EMAILS como respaldo de emergencia. Se deduplica por
 * correo y se acota para evitar listas accidentalmente masivas.
 */
async function loadLegacyLeadNotificationRecipients(): Promise<LeadRecipient[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('landing_contenido')
    .select('contenido, activo')
    .eq('id', RECIPIENTS_CONFIG_ID)
    .maybeSingle();

  if (!error && data?.activo === false) return [];
  const raw: unknown[] = [];
  if (!error && data?.activo !== false) {
    const contenido = data?.contenido as { destinatarios?: unknown } | null;
    if (Array.isArray(contenido?.destinatarios)) raw.push(...contenido.destinatarios);
  }
  if (raw.length === 0 && !data) {
    raw.push(...(process.env.LEADS_NOTIFICATION_EMAILS ?? '').split(','));
  }

  const byEmail = new Map<string, LeadRecipient>();
  for (const value of raw) {
    const recipient = normalizeRecipient(value);
    if (recipient && !byEmail.has(recipient.email)) byEmail.set(recipient.email, recipient);
  }
  return Array.from(byEmail.values()).slice(0, MAX_RECIPIENTS);
}

export async function loadLeadNotificationRecipients(): Promise<LeadRecipient[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(LEAD_NOTIFICATION_SETTINGS_TABLE)
    .select('activo, destinatarios')
    .eq('id', LEAD_NOTIFICATION_SETTINGS_ID)
    .maybeSingle();
  if (error?.code === 'PGRST205' || error?.code === '42P01') return loadLegacyLeadNotificationRecipients();
  if (error) throw new Error('No se pudo leer la configuración privada de notificaciones.');
  if (!data) throw new Error('Falta la configuración privada de notificaciones.');
  return recipientsFromPrivateSettings(data);
}

function truncate(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

async function buildLeadSummary(admin: ReturnType<typeof getSupabaseAdmin>, lead: LeadRow): Promise<string> {
  const parts: string[] = [];
  if (lead.mensaje?.trim()) parts.push(truncate(lead.mensaje, 600));

  if (lead.fuente === 'empaques_personalizados') {
    const { data } = await admin
      .from('lead_empaques_personalizados')
      .select('tipo_empaque, referencia_sku, modalidad, caras, cantidad, archivos')
      .eq('lead_id', lead.id)
      .maybeSingle();
    if (data) {
      const files = Array.isArray(data.archivos) ? data.archivos.length : 0;
      const modalidad = data.modalidad === 'muestra' ? 'muestra' : data.modalidad === 'produccion' ? 'producción' : null;
      parts.push([
        `Empaque personalizado: ${data.tipo_empaque}${data.referencia_sku ? ` (ref. ${data.referencia_sku})` : ''}.`,
        modalidad ? `Modalidad ${modalidad}${data.caras ? `, ${data.caras} cara(s)` : ''}.` : null,
        `Cantidad: ${data.cantidad}.`,
        files > 0 ? `Artes recibidos: ${files} archivo(s); descárgalos desde el panel (no se adjuntan al correo).` : 'Sin artes adjuntos registrados.',
      ].filter(Boolean).join(' '));
    } else {
      parts.push('Empaque personalizado: el detalle se consulta en el panel.');
    }
  }

  return parts.join('\n\n') || 'El contacto no dejó un mensaje; revisa la solicitud en el panel.';
}

/**
 * Encola el aviso por correo de un lead recién creado hacia los destinatarios
 * configurados, reutilizando el outbox de Resend con reintentos. Idempotente
 * por lead: si ya existen correos `lead_creado` para esa entidad no duplica.
 */
export async function enqueueLeadNotifications(leadId: string): Promise<EnqueueLeadNotificationsResult> {
  const admin = getSupabaseAdmin();

  const [{ data: lead, error: leadError }, recipients, template] = await Promise.all([
    admin.from('leads').select('id, nombre, empresa, email, telefono, mensaje, fuente').eq('id', leadId).single(),
    loadLeadNotificationRecipients(),
    getNotificationEmailTemplate('lead_creado'),
  ]);

  if (leadError || !lead) throw new Error(leadError?.message || 'No se pudo cargar el lead para notificar.');
  if (!template.activa) return { emailCount: 0, skippedReason: 'La plantilla lead_creado está desactivada.' };
  if (recipients.length === 0) return { emailCount: 0, skippedReason: 'No hay destinatarios configurados para avisos de leads.' };

  const { count, error: existingError } = await admin
    .from('notificaciones_email')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'lead_creado')
    .eq('entidad_id', leadId);
  if (existingError) throw new Error(existingError.message);
  if ((count ?? 0) > 0) return { emailCount: 0, skippedReason: 'El aviso de este lead ya estaba encolado.' };

  const contacto = [lead.email?.trim() || null, lead.telefono?.trim() || null].filter(Boolean).join(' · ');
  const resumen = await buildLeadSummary(admin, lead as LeadRow);
  const ruta = `/admin/leads?lead=${lead.id}`;

  const emailRows = recipients.map((recipient) => {
    const context = {
      lead_nombre: lead.nombre,
      lead_empresa: lead.empresa,
      lead_contacto: contacto || 'Sin datos de contacto',
      lead_fuente: lead.fuente,
      lead_resumen: resumen,
      destinatario_nombre: recipient.nombre,
      destinatario_email: recipient.email,
      ruta,
    };
    const resolved = renderEditableNotificationTemplate(template, context);
    return {
      usuario_id: null,
      actor_usuario_id: null,
      empresa_id: null,
      tipo: 'lead_creado' as const,
      email_destino: recipient.email,
      nombre_destino: recipient.nombre,
      asunto: resolved.asunto,
      payload: {
        ...context,
        titulo: resolved.titulo,
        intro: resolved.intro,
        descripcion: resolved.descripcion,
        cta_label: resolved.ctaLabel,
      },
      entidad_tipo: 'lead',
      entidad_id: lead.id,
    };
  });

  const { error: insertError } = await admin.from('notificaciones_email').insert(emailRows);
  if (insertError) throw new Error(insertError.message);

  // Envío inmediato con el cron como respaldo ante fallos transitorios.
  try {
    await processPendingEmailNotifications({ limit: emailRows.length + 5 });
  } catch {
    // Silencioso: el cron de cada 10 minutos reintenta.
  }

  return { emailCount: emailRows.length, skippedReason: null };
}

/** Variante segura: un fallo del aviso nunca debe perder ni bloquear el lead. */
export async function safeEnqueueLeadNotifications(leadId: string) {
  try {
    return { error: null, result: await enqueueLeadNotifications(leadId) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo encolar el aviso del lead.',
      result: null,
    };
  }
}
