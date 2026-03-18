import 'server-only';

import { getAppBaseUrl } from '@/lib/email/resend';
import type { TipoNotificacion } from '@/types';

type NotificationEmailPayload = {
  actor_nombre?: string | null;
  descripcion?: string | null;
  destinatario_nombre?: string | null;
  empresa?: string | null;
  pedido_numero?: string | null;
  pedido_estado?: string | null;
  ruta?: string | null;
  sede?: string | null;
  titulo?: string | null;
  total_items?: number | null;
  valor_total_label?: string | null;
};

type RenderNotificationEmailInput = {
  asunto: string;
  payload?: Record<string, unknown> | null;
  tipo: TipoNotificacion;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizePayload(payload?: Record<string, unknown> | null): NotificationEmailPayload {
  return {
    actor_nombre: typeof payload?.actor_nombre === 'string' ? payload.actor_nombre : null,
    descripcion: typeof payload?.descripcion === 'string' ? payload.descripcion : null,
    destinatario_nombre:
      typeof payload?.destinatario_nombre === 'string' ? payload.destinatario_nombre : null,
    empresa: typeof payload?.empresa === 'string' ? payload.empresa : null,
    pedido_numero: typeof payload?.pedido_numero === 'string' ? payload.pedido_numero : null,
    pedido_estado: typeof payload?.pedido_estado === 'string' ? payload.pedido_estado : null,
    ruta: typeof payload?.ruta === 'string' ? payload.ruta : null,
    sede: typeof payload?.sede === 'string' ? payload.sede : null,
    titulo: typeof payload?.titulo === 'string' ? payload.titulo : null,
    total_items: typeof payload?.total_items === 'number' ? payload.total_items : null,
    valor_total_label:
      typeof payload?.valor_total_label === 'string' ? payload.valor_total_label : null,
  };
}

function getAbsoluteRoute(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${getAppBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

function getIntro(tipo: TipoNotificacion, payload: NotificationEmailPayload) {
  switch (tipo) {
    case 'pedido_creado_en_aprobacion':
      return `Se registró un pedido${payload.pedido_numero ? ` (${payload.pedido_numero})` : ''} que requiere aprobación.`;
    case 'pedido_creado_autoaprobado':
      return `Se registró un pedido${payload.pedido_numero ? ` (${payload.pedido_numero})` : ''} con aprobación automática.`;
    case 'pedido_aprobado':
      return `El pedido${payload.pedido_numero ? ` ${payload.pedido_numero}` : ''} fue aprobado${payload.actor_nombre ? ` por ${payload.actor_nombre}` : ''}.`;
    case 'pedido_rechazado':
      return `El pedido${payload.pedido_numero ? ` ${payload.pedido_numero}` : ''} fue rechazado${payload.actor_nombre ? ` por ${payload.actor_nombre}` : ''}.`;
    case 'pedido_validado':
      return `El pedido${payload.pedido_numero ? ` ${payload.pedido_numero}` : ''} pasó a validación Imprima${payload.actor_nombre ? ` por ${payload.actor_nombre}` : ''}.`;
    case 'pedido_procesado_odoo':
      return `El pedido${payload.pedido_numero ? ` ${payload.pedido_numero}` : ''} fue procesado en Odoo.`;
  }
}

function buildSummaryItems(payload: NotificationEmailPayload) {
  const items: Array<{ label: string; value: string }> = [];

  if (payload.empresa) items.push({ label: 'Empresa', value: payload.empresa });
  if (payload.sede) items.push({ label: 'Sede', value: payload.sede });
  if (payload.pedido_numero) items.push({ label: 'Pedido', value: payload.pedido_numero });
  if (payload.pedido_estado) items.push({ label: 'Estado', value: payload.pedido_estado });
  if (payload.total_items != null) items.push({ label: 'Items', value: String(payload.total_items) });
  if (payload.valor_total_label) items.push({ label: 'Valor', value: payload.valor_total_label });

  return items;
}

export function renderNotificationEmail(input: RenderNotificationEmailInput) {
  const payload = normalizePayload(input.payload);
  const title = payload.titulo || input.asunto;
  const intro = getIntro(input.tipo, payload);
  const description = payload.descripcion || 'Tienes una nueva actualización dentro de la plataforma.';
  const recipientName = payload.destinatario_nombre || 'usuario';
  const absoluteRoute = getAbsoluteRoute(payload.ruta);
  const summaryItems = buildSummaryItems(payload);

  const summaryHtml = summaryItems
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;">${escapeHtml(item.label)}</td><td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(item.value)}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
        <p style="margin:0 0 12px;font-size:14px;color:#64748b;">Imprima B2B</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#0f172a;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">Hola ${escapeHtml(recipientName)},</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(intro)}</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(description)}</p>
        ${summaryItems.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">${summaryHtml}</table>` : ''}
        ${absoluteRoute ? `<a href="${escapeHtml(absoluteRoute)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">Ver detalle en la plataforma</a>` : ''}
      </div>
    </div>
  </body>
</html>`;

  const lines = [
    `Imprima B2B`,
    '',
    `${title}`,
    '',
    `Hola ${recipientName},`,
    '',
    intro,
    description,
    '',
    ...summaryItems.map((item) => `${item.label}: ${item.value}`),
  ];

  if (absoluteRoute) {
    lines.push('', `Ver detalle: ${absoluteRoute}`);
  }

  return {
    html,
    text: lines.join('\n'),
  };
}
