export const LEAD_NOTIFICATION_SETTINGS_TABLE = 'lead_notification_settings';
export const LEAD_NOTIFICATION_SETTINGS_ID = 'leads';
export const MAX_LEAD_RECIPIENTS = 10;
export type LeadNotificationRecipient = { email: string; nombre: string | null };
export type LeadNotificationSettings = { activo: boolean; destinatarios: LeadNotificationRecipient[]; updated_at: string };

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

function parseRecipients(raw: unknown): LeadNotificationRecipient[] {
  if (!Array.isArray(raw) || raw.length > MAX_LEAD_RECIPIENTS) throw new Error(`La lista admite hasta ${MAX_LEAD_RECIPIENTS} destinatarios.`);
  const result = new Map<string, LeadNotificationRecipient>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Cada destinatario debe incluir un correo.');
    if (typeof item.email !== 'string') throw new Error('El correo es obligatorio.');
    const email = item.email.trim().toLowerCase();
    const local = email.split('@')[0];
    if (email.length > 254 || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !EMAIL.test(email)) throw new Error('Hay un correo inválido en la lista.');
    if (item.nombre != null && (typeof item.nombre !== 'string' || item.nombre.trim().length > 120)) throw new Error('El nombre opcional debe tener hasta 120 caracteres.');
    const nombre = typeof item.nombre === 'string' ? item.nombre.trim() || null : null;
    if (!result.has(email)) result.set(email, { email, nombre });
  }
  return [...result.values()];
}

export function parseLeadNotificationSettings(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Configuración inválida.');
  const value = raw as Record<string, unknown>;
  if (typeof value.activo !== 'boolean') throw new Error('Indica si los avisos están activos.');
  const destinatarios = parseRecipients(value.destinatarios);
  if (value.activo && destinatarios.length === 0) throw new Error('Agrega al menos un destinatario antes de activar los avisos.');
  const version = value.expected_updated_at;
  if (typeof version !== 'string' || version !== version.trim() || version.length > 40
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(version)
    || !Number.isFinite(Date.parse(version))) throw new Error('Recarga la configuración antes de guardar.');
  return { activo: value.activo, destinatarios, expected_updated_at: version };
}

export function recipientsFromPrivateSettings(settings: { activo: boolean; destinatarios: unknown }): LeadNotificationRecipient[] {
  if (settings.activo !== true) return [];
  return parseRecipients(settings.destinatarios);
}
