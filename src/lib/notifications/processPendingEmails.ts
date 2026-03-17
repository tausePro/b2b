import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isResendConfigured, sendTransactionalEmail } from '@/lib/email/resend';
import { renderNotificationEmail } from '@/lib/email/templates/notificaciones';
import type { NotificacionEmail } from '@/types';

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

type NormalizedNotificacionEmail = Omit<NotificacionEmail, 'payload'> & {
  payload: Record<string, unknown>;
};

type ProcessPendingEmailNotificationsInput = {
  limit?: number;
};

type ProcessPendingEmailNotificationsResult = {
  configurationError: string | null;
  failed: number;
  processed: number;
  sent: number;
  skipped: number;
  totalCandidates: number;
};

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizeBatchSize(limit?: number) {
  if (!Number.isFinite(limit)) return DEFAULT_BATCH_SIZE;
  const parsed = Math.trunc(limit as number);
  return Math.min(Math.max(parsed, 1), MAX_BATCH_SIZE);
}

function getRetryDelayMs(intentos: number) {
  const retryMinutes = Math.min(180, Math.max(5, 5 * 2 ** Math.max(intentos - 1, 0)));
  return retryMinutes * 60 * 1000;
}

function normalizeEmailRow(
  row: NotificacionEmail | null | undefined
): NormalizedNotificacionEmail | null {
  if (!row) return null;

  return {
    ...row,
    payload: row.payload ?? {},
  };
}

async function loadPendingEmails(limit: number) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('notificaciones_email')
    .select('*')
    .in('estado', ['pendiente', 'error'])
    .lte('scheduled_at', now)
    .lt('intentos', MAX_ATTEMPTS)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as NotificacionEmail[])
    .map((item) => normalizeEmailRow(item))
    .filter((item): item is NormalizedNotificacionEmail => item !== null);
}

async function claimEmailForProcessing(email: NormalizedNotificacionEmail) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('notificaciones_email')
    .update({
      estado: 'procesando',
      intentos: email.intentos + 1,
      last_error: null,
    })
    .eq('id', email.id)
    .in('estado', ['pendiente', 'error'])
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeEmailRow((data as NotificacionEmail | null) ?? null);
}

async function markEmailAsSent(email: NormalizedNotificacionEmail, providerMessageId: string) {
  const admin = getSupabaseAdmin();
  const sentAt = new Date().toISOString();
  const { error } = await admin
    .from('notificaciones_email')
    .update({
      estado: 'enviado',
      provider: 'resend',
      provider_message_id: providerMessageId,
      sent_at: sentAt,
      last_error: null,
    })
    .eq('id', email.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function markEmailAsError(email: NormalizedNotificacionEmail, errorMessage: string) {
  const admin = getSupabaseAdmin();
  const nextRetryAt = new Date(Date.now() + getRetryDelayMs(email.intentos)).toISOString();
  const { error } = await admin
    .from('notificaciones_email')
    .update({
      estado: 'error',
      provider: 'resend',
      last_error: errorMessage,
      scheduled_at: nextRetryAt,
    })
    .eq('id', email.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function processPendingEmailNotifications(
  input: ProcessPendingEmailNotificationsInput = {}
): Promise<ProcessPendingEmailNotificationsResult> {
  if (!isResendConfigured()) {
    return {
      configurationError: 'Resend no está configurado. Define RESEND_API_KEY y RESEND_FROM_EMAIL.',
      failed: 0,
      processed: 0,
      sent: 0,
      skipped: 0,
      totalCandidates: 0,
    };
  }

  const limit = normalizeBatchSize(input.limit);
  const pendingEmails = await loadPendingEmails(limit);

  let failed = 0;
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const pendingEmail of pendingEmails) {
    const claimedEmail = await claimEmailForProcessing(pendingEmail);

    if (!claimedEmail) {
      skipped += 1;
      continue;
    }

    processed += 1;

    try {
      const rendered = renderNotificationEmail({
        asunto: claimedEmail.asunto,
        payload: claimedEmail.payload ?? {},
        tipo: claimedEmail.tipo,
      });

      const result = await sendTransactionalEmail({
        to: claimedEmail.email_destino,
        subject: claimedEmail.asunto,
        html: rendered.html,
        text: rendered.text,
      });

      await markEmailAsSent(claimedEmail, result.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      await markEmailAsError(
        claimedEmail,
        error instanceof Error ? error.message : 'No se pudo enviar el correo con Resend.'
      );
    }
  }

  return {
    configurationError: null,
    failed,
    processed,
    sent,
    skipped,
    totalCandidates: pendingEmails.length,
  };
}
