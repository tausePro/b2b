import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { renderNotificationEmail } from '@/lib/email/templates/notificaciones';
import type {
  NotificationEmailTemplate,
  NotificationEmailTemplatePreview,
  NotificationEmailTemplateVariable,
  NotificationEmailTemplateVariableKey,
  TipoNotificacion,
} from '@/types';

type StoredNotificationEmailTemplateRow = {
  tipo: TipoNotificacion;
  nombre: string;
  descripcion_operativa: string;
  asunto_template: string;
  titulo_template: string;
  intro_template: string;
  descripcion_template: string;
  cta_label: string;
  activa: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type TemplateContext = Record<string, string | number | boolean | null | undefined>;

type ResolveTemplateOptions = {
  preserveMissingTokens?: boolean;
};

const TEMPLATE_VARIABLES: Record<NotificationEmailTemplateVariableKey, NotificationEmailTemplateVariable> = {
  actor_nombre: {
    key: 'actor_nombre',
    label: 'Actor',
    description: 'Nombre del usuario que aprobó, rechazó o validó el pedido.',
  },
  destinatario_email: {
    key: 'destinatario_email',
    label: 'Correo destino',
    description: 'Correo electrónico del usuario que recibe la notificación.',
  },
  destinatario_nombre: {
    key: 'destinatario_nombre',
    label: 'Nombre destino',
    description: 'Nombre completo del usuario que recibe la notificación.',
  },
  destinatario_rol: {
    key: 'destinatario_rol',
    label: 'Rol destino',
    description: 'Rol del destinatario dentro de la plataforma.',
  },
  detalle_odoo_aprobacion: {
    key: 'detalle_odoo_aprobacion',
    label: 'Detalle Odoo aprobación',
    description: 'Frase adicional cuando el pedido aprobado ya fue enviado a Odoo.',
  },
  empresa: {
    key: 'empresa',
    label: 'Empresa',
    description: 'Nombre de la empresa asociada al pedido.',
  },
  pedido_estado: {
    key: 'pedido_estado',
    label: 'Estado del pedido',
    description: 'Estado actual del pedido al momento de encolar la notificación.',
  },
  pedido_id: {
    key: 'pedido_id',
    label: 'ID del pedido',
    description: 'Identificador interno del pedido en la plataforma.',
  },
  pedido_numero: {
    key: 'pedido_numero',
    label: 'Número del pedido',
    description: 'Número visible del pedido.',
  },
  ruta: {
    key: 'ruta',
    label: 'Ruta',
    description: 'Ruta relativa del detalle dentro de la plataforma.',
  },
  sede: {
    key: 'sede',
    label: 'Sede',
    description: 'Nombre de la sede asociada al pedido.',
  },
  total_items: {
    key: 'total_items',
    label: 'Items',
    description: 'Cantidad total de ítems del pedido.',
  },
  valor_total_label: {
    key: 'valor_total_label',
    label: 'Valor total',
    description: 'Total del pedido formateado para mostrar en el correo.',
  },
};

const DEFAULT_TEMPLATE_VARIABLE_KEYS: NotificationEmailTemplateVariableKey[] = [
  'pedido_numero',
  'empresa',
  'sede',
  'actor_nombre',
  'pedido_estado',
  'valor_total_label',
  'total_items',
  'destinatario_nombre',
  'destinatario_email',
  'destinatario_rol',
  'ruta',
  'pedido_id',
  'detalle_odoo_aprobacion',
];

const TEMPLATE_VARIABLE_PREVIEW_VALUES: Record<NotificationEmailTemplateVariableKey, string> = {
  actor_nombre: '{{actor_nombre}}',
  destinatario_email: '{{destinatario_email}}',
  destinatario_nombre: '{{destinatario_nombre}}',
  destinatario_rol: '{{destinatario_rol}}',
  detalle_odoo_aprobacion: '{{detalle_odoo_aprobacion}}',
  empresa: '{{empresa}}',
  pedido_estado: '{{pedido_estado}}',
  pedido_id: '{{pedido_id}}',
  pedido_numero: '{{pedido_numero}}',
  ruta: '/dashboard/pedidos/{{pedido_id}}',
  sede: '{{sede}}',
  total_items: '{{total_items}}',
  valor_total_label: '{{valor_total_label}}',
};

const DEFAULT_NOTIFICATION_EMAIL_TEMPLATES: Record<TipoNotificacion, Omit<NotificationEmailTemplate, 'created_at' | 'updated_at'>> = {
  pedido_creado_en_aprobacion: {
    tipo: 'pedido_creado_en_aprobacion',
    nombre: 'Pedido creado pendiente de aprobación',
    descripcion_operativa: 'Se envía a los aprobadores cuando un pedido entra al flujo de aprobación.',
    nivel: 'warning',
    asunto_template: 'Nuevo pedido {{pedido_numero}} pendiente de aprobación',
    titulo_template: 'Pedido {{pedido_numero}} pendiente de aprobación',
    intro_template: 'Se registró un pedido {{pedido_numero}} que requiere aprobación.',
    descripcion_template: 'Se creó un nuevo pedido para {{sede}} y requiere aprobación dentro de {{empresa}}.',
    cta_label: 'Revisar pedido en la plataforma',
    activa: true,
    variables: DEFAULT_TEMPLATE_VARIABLE_KEYS.map((key) => TEMPLATE_VARIABLES[key]),
  },
  pedido_creado_autoaprobado: {
    tipo: 'pedido_creado_autoaprobado',
    nombre: 'Pedido creado con aprobación automática',
    descripcion_operativa: 'Se envía al creador y a los asesores cuando un pedido no requiere aprobación.',
    nivel: 'success',
    asunto_template: 'Pedido {{pedido_numero}} creado con aprobación automática',
    titulo_template: 'Pedido {{pedido_numero}} creado con aprobación automática',
    intro_template: 'Se registró un pedido {{pedido_numero}} con aprobación automática.',
    descripcion_template: 'El pedido quedó creado sin requerir aprobación para {{empresa}}.',
    cta_label: 'Ver detalle del pedido',
    activa: true,
    variables: DEFAULT_TEMPLATE_VARIABLE_KEYS.map((key) => TEMPLATE_VARIABLES[key]),
  },
  pedido_aprobado: {
    tipo: 'pedido_aprobado',
    nombre: 'Pedido aprobado',
    descripcion_operativa: 'Se envía al creador y a los asesores cuando un aprobador aprueba el pedido.',
    nivel: 'success',
    asunto_template: 'Pedido {{pedido_numero}} aprobado',
    titulo_template: 'Pedido {{pedido_numero}} aprobado',
    intro_template: 'El pedido {{pedido_numero}} fue aprobado por {{actor_nombre}}.',
    descripcion_template: '{{actor_nombre}} aprobó el pedido. {{detalle_odoo_aprobacion}}',
    cta_label: 'Ver pedido aprobado',
    activa: true,
    variables: DEFAULT_TEMPLATE_VARIABLE_KEYS.map((key) => TEMPLATE_VARIABLES[key]),
  },
  pedido_rechazado: {
    tipo: 'pedido_rechazado',
    nombre: 'Pedido rechazado',
    descripcion_operativa: 'Se envía al creador cuando un aprobador rechaza el pedido.',
    nivel: 'danger',
    asunto_template: 'Pedido {{pedido_numero}} rechazado',
    titulo_template: 'Pedido {{pedido_numero}} rechazado',
    intro_template: 'El pedido {{pedido_numero}} fue rechazado por {{actor_nombre}}.',
    descripcion_template: '{{actor_nombre}} rechazó el pedido asociado a la sede {{sede}}.',
    cta_label: 'Revisar pedido rechazado',
    activa: true,
    variables: DEFAULT_TEMPLATE_VARIABLE_KEYS.map((key) => TEMPLATE_VARIABLES[key]),
  },
  pedido_validado: {
    tipo: 'pedido_validado',
    nombre: 'Pedido en validación Imprima',
    descripcion_operativa: 'Se envía al creador cuando un asesor toma el pedido para validación comercial.',
    nivel: 'info',
    asunto_template: 'Pedido {{pedido_numero}} en validación Imprima',
    titulo_template: 'Pedido {{pedido_numero}} en validación Imprima',
    intro_template: 'El pedido {{pedido_numero}} pasó a validación Imprima por {{actor_nombre}}.',
    descripcion_template: '{{actor_nombre}} tomó el pedido para validación comercial dentro de Imprima.',
    cta_label: 'Ver estado de validación',
    activa: true,
    variables: DEFAULT_TEMPLATE_VARIABLE_KEYS.map((key) => TEMPLATE_VARIABLES[key]),
  },
  pedido_procesado_odoo: {
    tipo: 'pedido_procesado_odoo',
    nombre: 'Pedido procesado en Odoo',
    descripcion_operativa: 'Se envía al creador y a los asesores cuando el pedido ya quedó sincronizado con Odoo.',
    nivel: 'success',
    asunto_template: 'Pedido {{pedido_numero}} procesado en Odoo',
    titulo_template: 'Pedido {{pedido_numero}} procesado en Odoo',
    intro_template: 'El pedido {{pedido_numero}} fue procesado en Odoo.',
    descripcion_template: 'El pedido ya quedó sincronizado con Odoo para {{empresa}}.',
    cta_label: 'Ver pedido procesado',
    activa: true,
    variables: DEFAULT_TEMPLATE_VARIABLE_KEYS.map((key) => TEMPLATE_VARIABLES[key]),
  },
};

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isMissingTemplatesTableError(message: string | null | undefined) {
  if (!message) return false;
  return message.includes('notificaciones_email_templates');
}

function mergeTemplateWithDefault(
  tipo: TipoNotificacion,
  stored?: StoredNotificationEmailTemplateRow | null
): NotificationEmailTemplate {
  const fallback = DEFAULT_NOTIFICATION_EMAIL_TEMPLATES[tipo];

  return {
    ...fallback,
    nombre: stored?.nombre?.trim() || fallback.nombre,
    descripcion_operativa: stored?.descripcion_operativa?.trim() || fallback.descripcion_operativa,
    asunto_template: stored?.asunto_template?.trim() || fallback.asunto_template,
    titulo_template: stored?.titulo_template?.trim() || fallback.titulo_template,
    intro_template: stored?.intro_template?.trim() || fallback.intro_template,
    descripcion_template: stored?.descripcion_template?.trim() || fallback.descripcion_template,
    cta_label: stored?.cta_label?.trim() || fallback.cta_label,
    activa: stored?.activa ?? fallback.activa,
    created_at: stored?.created_at ?? null,
    updated_at: stored?.updated_at ?? null,
  };
}

async function readStoredTemplates() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('notificaciones_email_templates')
    .select('tipo, nombre, descripcion_operativa, asunto_template, titulo_template, intro_template, descripcion_template, cta_label, activa, created_at, updated_at');

  if (error) {
    if (isMissingTemplatesTableError(error.message)) {
      return [] as StoredNotificationEmailTemplateRow[];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as StoredNotificationEmailTemplateRow[];
}

export function listDefaultNotificationEmailTemplates() {
  return Object.values(DEFAULT_NOTIFICATION_EMAIL_TEMPLATES);
}

export function resolveTemplateString(
  template: string,
  context: TemplateContext,
  options: ResolveTemplateOptions = {}
) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = context[key];

    if (value === null || value === undefined || value === '') {
      return options.preserveMissingTokens ? `{{${key}}}` : '';
    }

    return String(value);
  });
}

export function renderEditableNotificationTemplate(
  template: NotificationEmailTemplate,
  context: TemplateContext,
  options: ResolveTemplateOptions = {}
) {
  return {
    asunto: resolveTemplateString(template.asunto_template, context, options).trim(),
    titulo: resolveTemplateString(template.titulo_template, context, options).trim(),
    intro: resolveTemplateString(template.intro_template, context, options).trim(),
    descripcion: resolveTemplateString(template.descripcion_template, context, options).trim(),
    ctaLabel: resolveTemplateString(template.cta_label, context, options).trim(),
  };
}

export async function getNotificationEmailTemplate(tipo: TipoNotificacion) {
  const storedTemplates = await readStoredTemplates();
  const storedTemplate = storedTemplates.find((item) => item.tipo === tipo) ?? null;
  return mergeTemplateWithDefault(tipo, storedTemplate);
}

export async function listNotificationEmailTemplates() {
  const storedTemplates = await readStoredTemplates();
  const storedByType = new Map(storedTemplates.map((item) => [item.tipo, item]));

  return (Object.keys(DEFAULT_NOTIFICATION_EMAIL_TEMPLATES) as TipoNotificacion[]).map((tipo) =>
    mergeTemplateWithDefault(tipo, storedByType.get(tipo) ?? null)
  );
}

export function buildNotificationEmailTemplatePreview(
  template: NotificationEmailTemplate
): NotificationEmailTemplatePreview {
  const placeholderContext = DEFAULT_TEMPLATE_VARIABLE_KEYS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = TEMPLATE_VARIABLE_PREVIEW_VALUES[key];
    return acc;
  }, {});

  const resolved = renderEditableNotificationTemplate(template, placeholderContext, {
    preserveMissingTokens: true,
  });

  const rendered = renderNotificationEmail({
    asunto: resolved.asunto,
    tipo: template.tipo,
    payload: {
      actor_nombre: placeholderContext.actor_nombre,
      cta_label: resolved.ctaLabel,
      descripcion: resolved.descripcion,
      destinatario_email: placeholderContext.destinatario_email,
      destinatario_nombre: placeholderContext.destinatario_nombre,
      empresa: placeholderContext.empresa,
      intro: resolved.intro,
      pedido_estado: placeholderContext.pedido_estado,
      pedido_numero: placeholderContext.pedido_numero,
      ruta: placeholderContext.ruta,
      sede: placeholderContext.sede,
      titulo: resolved.titulo,
      total_items: placeholderContext.total_items,
      valor_total_label: placeholderContext.valor_total_label,
    },
  });

  return {
    ...template,
    preview_html: rendered.html,
    preview_text: rendered.text,
  };
}

export async function listNotificationEmailTemplatesWithPreview() {
  const templates = await listNotificationEmailTemplates();
  return templates.map((template) => buildNotificationEmailTemplatePreview(template));
}

type UpsertNotificationEmailTemplateInput = {
  tipo: TipoNotificacion;
  nombre?: string;
  descripcion_operativa?: string;
  asunto_template: string;
  titulo_template: string;
  intro_template: string;
  descripcion_template: string;
  cta_label: string;
  activa?: boolean;
};

export async function upsertNotificationEmailTemplate(input: UpsertNotificationEmailTemplateInput) {
  const admin = getSupabaseAdmin();
  const fallback = DEFAULT_NOTIFICATION_EMAIL_TEMPLATES[input.tipo];
  const payload = {
    tipo: input.tipo,
    nombre: input.nombre?.trim() || fallback.nombre,
    descripcion_operativa: input.descripcion_operativa?.trim() || fallback.descripcion_operativa,
    asunto_template: input.asunto_template.trim(),
    titulo_template: input.titulo_template.trim(),
    intro_template: input.intro_template.trim(),
    descripcion_template: input.descripcion_template.trim(),
    cta_label: input.cta_label.trim() || fallback.cta_label,
    activa: input.activa ?? true,
  };

  const { data, error } = await admin
    .from('notificaciones_email_templates')
    .upsert(payload, { onConflict: 'tipo' })
    .select('tipo, nombre, descripcion_operativa, asunto_template, titulo_template, intro_template, descripcion_template, cta_label, activa, created_at, updated_at')
    .single();

  if (error) {
    if (isMissingTemplatesTableError(error.message)) {
      throw new Error('Falta aplicar la migración de plantillas de correo antes de guardar cambios.');
    }

    throw new Error(error.message);
  }

  return mergeTemplateWithDefault(input.tipo, data as StoredNotificationEmailTemplateRow);
}
