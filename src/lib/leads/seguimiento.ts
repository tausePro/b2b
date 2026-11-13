import { escapeCsvCell } from '@/lib/informes/pedidos';

export const LEAD_CONTACT_SLA_HOURS = 2;
export const LEAD_CONVERSION_GOAL = 20;
export const LEAD_PERIOD_DAYS = 30;

export type LeadEstado = 'nuevo' | 'contactado' | 'convertido' | 'descartado';
export type LeadAttribution = 'google_ads' | 'utm' | 'organico';

export const LEAD_ESTADOS: { value: LeadEstado; label: string }[] = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'descartado', label: 'Descartado' },
];

export const ATTRIBUTION_LABELS: Record<LeadAttribution, string> = { google_ads: 'Google Ads', utm: 'UTM', organico: 'Orgánico / directo' };

export interface LeadTrackingInput {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  mensaje: string | null;
  estado: string;
  fuente: string;
  created_at: string;
  contactado_at?: string | null;
  asignado_nombre?: string | null;
  gclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export interface LeadSummary {
  periodDays: number;
  total: number;
  previousTotal: number;
  changePercent: number | null;
  uncontacted: number;
  overdue: number;
  converted: number;
  conversionPercent: number | null;
  googleAds: { count: number; percent: number | null; converted: number };
  funnel: { estado: LeadEstado; count: number; percent: number | null }[];
  averageResponseHours: number | null;
  sources: { label: string; count: number; converted: number }[];
  attribution: { kind: LeadAttribution; count: number; percent: number | null }[];
}

const SOURCE_DETAILS: Record<string, [string, string | null]> = {
  empaques_hero: ['Empaques', 'Inicio'], empaques_cotizacion: ['Empaques', 'Cotización'], empaques_personalizados: ['Empaques', 'Personalizados'],
  landing_hero: ['Home', 'Hero'], landing_cta: ['Home', 'CTA final'],
  whatsapp_bubble: ['WhatsApp', 'Burbuja'], contacto_whatsapp: ['WhatsApp', 'Contacto'],
  catalogo_banner: ['Catálogo', 'Banner'], catalogo_publico_sin_resultados: ['Catálogo', 'Sin resultados'], catalogo_publico_cta: ['Catálogo', 'CTA final'],
  contacto_formulario: ['Contacto', 'Formulario'],
};

/** Fuente técnica (`empaques_producto_11448`) a un origen legible ("Empaques · Producto"). */
export function leadSource(fuente: string): { group: string; detail: string | null; label: string } {
  const known = SOURCE_DETAILS[fuente];
  const [group, detail] = known
    ?? (fuente.startsWith('empaques_producto') ? ['Empaques', 'Producto']
      : fuente.startsWith('empaques_') ? ['Empaques', null]
        : fuente.startsWith('producto_') ? ['Producto', 'Detalle']
          : fuente.startsWith('contacto_comercial_') ? ['Contacto', 'Equipo comercial']
            : fuente.startsWith('catalogo_') ? ['Catálogo', null]
              : ['Otros', fuente || null]);
  return { group, detail, label: detail ? `${group} · ${detail}` : group };
}

export function leadAttribution(lead: Pick<LeadTrackingInput, 'gclid' | 'utm_source' | 'utm_medium' | 'utm_campaign'>): LeadAttribution {
  if (lead.gclid) return 'google_ads';
  return lead.utm_source || lead.utm_medium || lead.utm_campaign ? 'utm' : 'organico';
}

export const hoursSince = (iso: string, now: number) => (now - Date.parse(iso)) / 3_600_000;

/** Lead nuevo que lleva más del plazo sin contactar. */
export function isLeadOverdue(lead: Pick<LeadTrackingInput, 'estado' | 'created_at'>, now: number, slaHours = LEAD_CONTACT_SLA_HOURS): boolean {
  return lead.estado === 'nuevo' && hoursSince(lead.created_at, now) > slaHours;
}

export function formatTimeAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function formatHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

const percent = (part: number, total: number) => (total > 0 ? Math.round(part / total * 1000) / 10 : null);

/** Resumen del período (por defecto últimos 30 días) comparado con el período anterior de igual duración. */
export function buildLeadSummary(leads: readonly LeadTrackingInput[], now: number, periodDays = LEAD_PERIOD_DAYS): LeadSummary {
  const start = now - periodDays * 86_400_000;
  const previousStart = start - periodDays * 86_400_000;
  const current = leads.filter(lead => Date.parse(lead.created_at) >= start);
  const previousTotal = leads.filter(lead => Date.parse(lead.created_at) >= previousStart && Date.parse(lead.created_at) < start).length;
  const total = current.length;
  const count = (estado: LeadEstado) => current.filter(lead => lead.estado === estado).length;
  const converted = count('convertido');
  const ads = current.filter(lead => leadAttribution(lead) === 'google_ads');
  const responses = current.filter(lead => lead.contactado_at).map(lead => (Date.parse(lead.contactado_at!) - Date.parse(lead.created_at)) / 3_600_000).filter(value => value >= 0);
  const sources = new Map<string, { count: number; converted: number }>();
  for (const lead of current) {
    const { label } = leadSource(lead.fuente);
    const entry = sources.get(label) ?? { count: 0, converted: 0 };
    entry.count++;
    if (lead.estado === 'convertido') entry.converted++;
    sources.set(label, entry);
  }
  return {
    periodDays, total, previousTotal,
    changePercent: previousTotal > 0 ? Math.round((total - previousTotal) / previousTotal * 1000) / 10 : null,
    uncontacted: count('nuevo'), overdue: current.filter(lead => isLeadOverdue(lead, now)).length,
    converted, conversionPercent: percent(converted, total),
    googleAds: { count: ads.length, percent: percent(ads.length, total), converted: ads.filter(lead => lead.estado === 'convertido').length },
    funnel: LEAD_ESTADOS.map(({ value }) => ({ estado: value, count: count(value), percent: percent(count(value), total) })),
    averageResponseHours: responses.length ? responses.reduce((sum, value) => sum + value, 0) / responses.length : null,
    sources: [...sources].map(([label, entry]) => ({ label, ...entry })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es')),
    attribution: (['google_ads', 'utm', 'organico'] as const).map(kind => {
      const value = current.filter(lead => leadAttribution(lead) === kind).length;
      return { kind, count: value, percent: percent(value, total) };
    }),
  };
}

/** Enlace de WhatsApp al teléfono del lead (E.164 o dígitos), con saludo prellenado. */
export function whatsappLink(phone: string | null, nombre: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const firstName = nombre.trim().split(/\s+/)[0] ?? '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Hola ${firstName}, te escribimos de Imprima por tu solicitud.`)}`;
}

export function buildLeadsCsv(leads: readonly LeadTrackingInput[]): string {
  const headers = ['Fecha', 'Nombre', 'Empresa', 'Correo', 'Teléfono', 'Estado', 'Origen', 'Atribución', 'Campaña', 'Asesora', 'Mensaje'];
  const rows = leads.map(lead => [
    lead.created_at, lead.nombre, lead.empresa ?? '', lead.email ?? '', lead.telefono ?? '',
    LEAD_ESTADOS.find(option => option.value === lead.estado)?.label ?? lead.estado, leadSource(lead.fuente).label,
    ATTRIBUTION_LABELS[leadAttribution(lead)], lead.utm_campaign ?? '', lead.asignado_nombre ?? '', lead.mensaje ?? '',
  ]);
  return `\uFEFF${[headers, ...rows].map(row => row.map(escapeCsvCell).join(';')).join('\r\n')}`;
}
