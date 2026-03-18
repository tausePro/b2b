import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getAppBaseUrl, isResendConfigured, sendTransactionalEmail } from '@/lib/email/resend';
import { renderNotificationEmail } from '@/lib/email/templates/notificaciones';
import {
  buildNotificationEmailTemplatePreview,
  getNotificationEmailTemplate,
  listNotificationEmailTemplatesWithPreview,
  upsertNotificationEmailTemplate,
} from '@/lib/notifications/emailTemplateStore';
import { processPendingEmailNotifications } from '@/lib/notifications/processPendingEmails';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  NotificationEmailTemplatePreview,
  TipoNotificacion,
} from '@/types';

const RECENT_EMAILS_LIMIT = 12;
const OUTBOX_PROCESS_LIMIT = 20;

type RecentEmailDbRow = {
  id: string;
  tipo: string;
  email_destino: string;
  nombre_destino: string | null;
  asunto: string;
  payload: Record<string, unknown> | null;
  estado: 'pendiente' | 'procesando' | 'enviado' | 'error';
  intentos: number;
  provider: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

type RecentEmailRow = RecentEmailDbRow & {
  preview_html: string | null;
  preview_text: string | null;
};

type EmailDiagnosticsResponse = {
  configuration: {
    appBaseUrl: string;
    apiKeyConfigured: boolean;
    cronSecretConfigured: boolean;
    fromEmail: string | null;
    fromName: string;
    internalProcessorSecretConfigured: boolean;
    resendConfigured: boolean;
  };
  outbox: {
    error: number;
    oldestPendingAt: string | null;
    pendiente: number;
    procesando: number;
    sent: number;
    total: number;
  };
  recentEmails: RecentEmailRow[];
  templates: NotificationEmailTemplatePreview[];
};

type ActionPayload = {
  action?: 'process-outbox' | 'save-template' | 'send-test';
  activa?: boolean;
  asunto_template?: string;
  cta_label?: string;
  descripcion_operativa?: string;
  descripcion_template?: string;
  intro_template?: string;
  limit?: number;
  nombre?: string;
  to?: string;
  tipo?: TipoNotificacion;
  titulo_template?: string;
};

const ALLOWED_NOTIFICATION_TYPES: TipoNotificacion[] = [
  'pedido_creado_en_aprobacion',
  'pedido_creado_autoaprobado',
  'pedido_aprobado',
  'pedido_rechazado',
  'pedido_validado',
  'pedido_procesado_odoo',
];

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type AuthorizedContext = {
  admin: AdminClient;
};

function getEmailConfiguration() {
  return {
    appBaseUrl: getAppBaseUrl(),
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
    fromEmail: process.env.RESEND_FROM_EMAIL?.trim() || null,
    fromName: process.env.RESEND_FROM_NAME?.trim() || 'Imprima B2B',
    internalProcessorSecretConfigured: Boolean(process.env.INTERNAL_EMAIL_PROCESSOR_SECRET?.trim()),
    resendConfigured: isResendConfigured(),
  };
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const parsed = Math.trunc(value as number);
  return parsed > 0 ? parsed : fallback;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidNotificationType(value: unknown): value is TipoNotificacion {
  return typeof value === 'string' && ALLOWED_NOTIFICATION_TYPES.includes(value as TipoNotificacion);
}

function normalizeRecentEmailPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function buildRecentEmailPreview(email: RecentEmailDbRow) {
  const payload = normalizeRecentEmailPayload(email.payload);

  try {
    const preview = renderNotificationEmail({
      asunto: email.asunto,
      payload: payload ?? {},
      tipo: email.tipo as TipoNotificacion,
    });

    return {
      ...email,
      payload,
      preview_html: preview.html,
      preview_text: preview.text,
    } satisfies RecentEmailRow;
  } catch {
    return {
      ...email,
      payload,
      preview_html: null,
      preview_text: null,
    } satisfies RecentEmailRow;
  }
}

async function authorizeSuperAdmin(): Promise<AuthorizedContext | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        error: 'UNAUTHORIZED',
        details: authError?.message ?? null,
      },
      { status: 401 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data: actorProfile, error: actorProfileError } = await admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (actorProfileError || !actorProfile || actorProfile.rol !== 'super_admin' || !actorProfile.activo) {
    return NextResponse.json(
      {
        error: 'FORBIDDEN',
        details: actorProfileError?.message ?? null,
      },
      { status: 403 }
    );
  }

  return { admin };
}

async function countOutboxByStatus(
  admin: AdminClient,
  estado: RecentEmailRow['estado']
) {
  const { count, error } = await admin
    .from('notificaciones_email')
    .select('id', { count: 'exact', head: true })
    .eq('estado', estado);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function readRecentEmails(admin: AdminClient) {
  const { data, error } = await admin
    .from('notificaciones_email')
    .select('id, tipo, email_destino, nombre_destino, asunto, payload, estado, intentos, provider, provider_message_id, last_error, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(RECENT_EMAILS_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RecentEmailDbRow[]).map((item) => buildRecentEmailPreview(item));
}

async function readOldestPendingAt(admin: AdminClient) {
  const { data, error } = await admin
    .from('notificaciones_email')
    .select('scheduled_at')
    .in('estado', ['pendiente', 'error'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ scheduled_at: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.scheduled_at ?? null;
}

async function buildDiagnostics(admin: AdminClient): Promise<EmailDiagnosticsResponse> {
  const configuration = getEmailConfiguration();
  const [pendiente, procesando, sent, error, oldestPendingAt, recentEmails, templates] = await Promise.all([
    countOutboxByStatus(admin, 'pendiente'),
    countOutboxByStatus(admin, 'procesando'),
    countOutboxByStatus(admin, 'enviado'),
    countOutboxByStatus(admin, 'error'),
    readOldestPendingAt(admin),
    readRecentEmails(admin),
    listNotificationEmailTemplatesWithPreview(),
  ]);

  return {
    configuration,
    outbox: {
      error,
      oldestPendingAt,
      pendiente,
      procesando,
      sent,
      total: pendiente + procesando + sent + error,
    },
    recentEmails,
    templates,
  };
}

function buildTestEmail(appBaseUrl: string, fromEmail: string | null) {
  const subject = 'Prueba de configuración de correo - Imprima B2B';
  const text = [
    'Esta es una prueba manual de la configuración de correo del panel superadmin.',
    '',
    `App URL: ${appBaseUrl}`,
    `Remitente configurado: ${fromEmail ?? 'No definido'}`,
    '',
    'Si recibes este mensaje, Resend está respondiendo correctamente para este proyecto.',
  ].join('\n');

  const html = [
    '<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">',
    '<h1 style="font-size: 20px; margin-bottom: 12px;">Prueba de configuración de correo</h1>',
    '<p>Esta es una prueba manual de la configuración de correo del panel superadmin.</p>',
    `<p><strong>App URL:</strong> ${appBaseUrl}</p>`,
    `<p><strong>Remitente configurado:</strong> ${fromEmail ?? 'No definido'}</p>`,
    '<p>Si recibes este mensaje, Resend está respondiendo correctamente para este proyecto.</p>',
    '</div>',
  ].join('');

  return { subject, text, html };
}

async function buildTemplateTestEmail(tipo: TipoNotificacion) {
  const template = await getNotificationEmailTemplate(tipo);
  const preview = buildNotificationEmailTemplatePreview(template);

  return {
    subject: preview.asunto_template,
    text: preview.preview_text,
    html: preview.preview_html,
  };
}

export async function GET() {
  try {
    const authorized = await authorizeSuperAdmin();
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const diagnostics = await buildDiagnostics(authorized.admin);
    return NextResponse.json(diagnostics);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await authorizeSuperAdmin();
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const body = (await request.json().catch(() => ({}))) as ActionPayload;
    const action = body.action ?? 'send-test';

    if (action === 'process-outbox') {
      const result = await processPendingEmailNotifications({
        limit: normalizePositiveInteger(body.limit, OUTBOX_PROCESS_LIMIT),
      });

      return NextResponse.json({
        diagnostics: await buildDiagnostics(authorized.admin),
        ok: !result.configurationError,
        result,
      });
    }

    if (action === 'save-template') {
      if (!isValidNotificationType(body.tipo)) {
        return NextResponse.json(
          {
            error: 'Debes indicar un tipo de notificación válido.',
          },
          { status: 400 }
        );
      }

      const asuntoTemplate = body.asunto_template?.trim();
      const tituloTemplate = body.titulo_template?.trim();
      const introTemplate = body.intro_template?.trim();
      const descripcionTemplate = body.descripcion_template?.trim();
      const ctaLabel = body.cta_label?.trim();

      if (
        !asuntoTemplate
        || !tituloTemplate
        || !introTemplate
        || !descripcionTemplate
        || !ctaLabel
      ) {
        return NextResponse.json(
          {
            error: 'Asunto, título, intro, descripción y CTA son obligatorios.',
          },
          { status: 400 }
        );
      }

      await upsertNotificationEmailTemplate({
        tipo: body.tipo,
        activa: body.activa ?? true,
        asunto_template: asuntoTemplate,
        cta_label: ctaLabel,
        descripcion_operativa: body.descripcion_operativa,
        descripcion_template: descripcionTemplate,
        intro_template: introTemplate,
        nombre: body.nombre,
        titulo_template: tituloTemplate,
      });

      return NextResponse.json({
        diagnostics: await buildDiagnostics(authorized.admin),
        ok: true,
      });
    }

    const to = body.to?.trim().toLowerCase() || '';
    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        {
          error: 'Debes indicar un correo válido para la prueba.',
        },
        { status: 400 }
      );
    }

    const configuration = getEmailConfiguration();
    if (!configuration.resendConfigured) {
      return NextResponse.json(
        {
          error: 'Resend no está configurado completamente en este entorno.',
          diagnostics: await buildDiagnostics(authorized.admin),
        },
        { status: 503 }
      );
    }

    if (body.tipo && !isValidNotificationType(body.tipo)) {
      return NextResponse.json(
        {
          error: 'La plantilla seleccionada para la prueba no es válida.',
        },
        { status: 400 }
      );
    }

    const testEmail = body.tipo
      ? await buildTemplateTestEmail(body.tipo)
      : buildTestEmail(configuration.appBaseUrl, configuration.fromEmail);
    const result = await sendTransactionalEmail({
      to,
      subject: testEmail.subject,
      html: testEmail.html,
      text: testEmail.text,
    });

    return NextResponse.json({
      diagnostics: await buildDiagnostics(authorized.admin),
      messageId: result.id,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
