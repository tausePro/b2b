import 'server-only';

const RESEND_API_URL = 'https://api.resend.com/emails';

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() || null;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || null;
  const fromName = process.env.RESEND_FROM_NAME?.trim() || 'Imprima B2B';

  return {
    apiKey,
    fromEmail,
    fromName,
  };
}

export function isResendConfigured() {
  const { apiKey, fromEmail } = getResendConfig();
  return Boolean(apiKey && fromEmail);
}

export function getAppBaseUrl() {
  const explicitUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/+$/, '')}`;
  }

  return 'http://localhost:3000';
}

function buildFromAddress(fromName: string, fromEmail: string) {
  return `${fromName} <${fromEmail}>`;
}

function getResendErrorMessage(data: unknown, fallbackMessage: string) {
  if (data && typeof data === 'object') {
    const message = 'message' in data && typeof data.message === 'string' ? data.message : null;
    const name = 'name' in data && typeof data.name === 'string' ? data.name : null;
    const error = 'error' in data && typeof data.error === 'string' ? data.error : null;

    if (name && message) return `${name}: ${message}`;
    if (message) return message;
    if (error) return error;
    if (name) return name;
  }

  return fallbackMessage;
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput) {
  const { apiKey, fromEmail, fromName } = getResendConfig();

  if (!apiKey || !fromEmail) {
    throw new Error('RESEND_NOT_CONFIGURED');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: buildFromAddress(fromName, fromEmail),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResendErrorMessage(data, 'Resend rechazó el envío del correo.'));
  }

  const messageId =
    data && typeof data === 'object' && 'id' in data && typeof data.id === 'string'
      ? data.id
      : null;

  if (!messageId) {
    throw new Error('Resend no devolvió un identificador de mensaje.');
  }

  return {
    id: messageId,
    provider: 'resend' as const,
  };
}
