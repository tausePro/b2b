import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { leadSource } from './seguimiento';

export interface LeadAdvisor { id: string; nombre: string }
export interface LeadEvent { id: string; tipo: 'nota' | 'estado' | 'asignacion' | 'sistema'; detalle: string; created_at: string; autor: string | null }

export const LEAD_TRACKING_MIGRATION_MESSAGE = 'Falta la migración 056 (seguimiento de leads). Ejecútala en Supabase para asignar asesoras y guardar el historial.';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
let trackingCache: { value: boolean; expires: number } | null = null;
const fullName = (row: { nombre?: string | null; apellido?: string | null } | null | undefined) => [row?.nombre, row?.apellido].filter(Boolean).join(' ').trim() || null;

/** ¿Está aplicada la migración 056? (columnas de seguimiento y tabla de eventos). */
export async function leadTrackingEnabled(): Promise<boolean> {
  if (trackingCache && trackingCache.expires > Date.now()) return trackingCache.value;
  const client = admin();
  const [columns, events] = await Promise.all([
    client.from('leads').select('asignado_a, contactado_at', { head: true, count: 'exact' }).limit(1),
    client.from('lead_eventos').select('id', { head: true, count: 'exact' }).limit(1),
  ]);
  const value = !columns.error && !events.error;
  trackingCache = { value, expires: Date.now() + (value ? 300_000 : 30_000) };
  return value;
}

/** Asesoras activas (rol principal o rol extra) a las que se puede asignar un lead. */
export async function loadLeadAdvisors(): Promise<LeadAdvisor[]> {
  const client = admin();
  const [primary, extra] = await Promise.all([
    client.from('usuarios').select('id, nombre, apellido').eq('rol', 'asesor').eq('activo', true),
    client.from('usuario_roles_extra').select('usuario:usuarios!inner(id, nombre, apellido, activo)').eq('rol', 'asesor').eq('activo', true).eq('usuarios.activo', true),
  ]);
  if (primary.error) throw new Error(primary.error.message);
  const advisors = new Map<string, string>();
  for (const row of primary.data ?? []) advisors.set(row.id, fullName(row) ?? 'Asesora');
  for (const row of extra.data ?? []) {
    const user = (Array.isArray(row.usuario) ? row.usuario[0] : row.usuario) as { id: string; nombre: string | null; apellido: string | null } | undefined;
    if (user) advisors.set(user.id, fullName(user) ?? 'Asesora');
  }
  return [...advisors].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function loadAdvisorNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await admin().from('usuarios').select('id, nombre, apellido').in('id', [...new Set(ids)]);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map(row => [row.id, fullName(row) ?? 'Asesora']));
}

/** Historial del lead: eventos guardados (056) y eventos del sistema que ya existen (aviso por correo, WhatsApp, creación). */
export async function loadLeadEvents(lead: { id: string; created_at: string; fuente: string; whatsapp_enviado: boolean }, trackingEnabled: boolean): Promise<LeadEvent[]> {
  const client = admin();
  const [stored, emails] = await Promise.all([
    trackingEnabled
      ? client.from('lead_eventos').select('id, tipo, detalle, created_at, usuario:usuarios(nombre, apellido)').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
    client.from('notificaciones_email').select('estado, sent_at, created_at').eq('entidad_tipo', 'lead').eq('entidad_id', lead.id),
  ]);
  if (stored.error) throw new Error(stored.error.message);
  const events: LeadEvent[] = (stored.data ?? []).map(row => {
    const user = Array.isArray(row.usuario) ? row.usuario[0] : row.usuario;
    return { id: row.id, tipo: row.tipo, detalle: row.detalle, created_at: row.created_at, autor: fullName(user as { nombre?: string | null; apellido?: string | null } | null) };
  });
  const sent = (emails.data ?? []).filter(row => row.estado === 'enviado');
  if (sent.length > 0) {
    const sentAt = sent.map(row => row.sent_at ?? row.created_at).filter(Boolean).sort().at(-1) ?? lead.created_at;
    events.push({ id: 'aviso-correo', tipo: 'sistema', detalle: `Aviso enviado por correo a ${sent.length} ${sent.length === 1 ? 'destinatario' : 'destinatarios'}`, created_at: sentAt, autor: null });
  }
  if (lead.whatsapp_enviado) events.push({ id: 'whatsapp', tipo: 'sistema', detalle: 'WhatsApp abierto desde el sitio', created_at: lead.created_at, autor: null });
  events.push({ id: 'creado', tipo: 'sistema', detalle: `Lead creado desde ${leadSource(lead.fuente).label}`, created_at: lead.created_at, autor: null });
  return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function recordLeadEvents(rows: { lead_id: string; tipo: 'nota' | 'estado' | 'asignacion'; detalle: string; usuario_id: string }[]) {
  if (rows.length === 0) return;
  const { error } = await admin().from('lead_eventos').insert(rows);
  if (error) throw new Error(error.message);
}
