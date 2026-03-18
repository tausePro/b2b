import { NextRequest, NextResponse } from 'next/server';
import { processPendingEmailNotifications } from '@/lib/notifications/processPendingEmails';

export const dynamic = 'force-dynamic';

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim() || null;
}

function getAllowedSecrets() {
  return Array.from(new Set([
    process.env.INTERNAL_EMAIL_PROCESSOR_SECRET?.trim() || null,
    process.env.CRON_SECRET?.trim() || null,
  ].filter((value): value is string => Boolean(value))));
}

function readLimitFromQuery(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  if (!limitParam) {
    return undefined;
  }

  const parsed = Number(limitParam);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readLimitFromBody(request: NextRequest) {
  try {
    const body = (await request.json()) as { limit?: number };
    return body.limit;
  } catch {
    return undefined;
  }
}

async function handleProcessRequest(request: NextRequest, limit: number | undefined) {
  try {
    const allowedSecrets = getAllowedSecrets();

    if (allowedSecrets.length === 0) {
      return NextResponse.json(
        {
          error: 'INTERNAL_SECRET_NOT_CONFIGURED',
          details: 'Define INTERNAL_EMAIL_PROCESSOR_SECRET o CRON_SECRET para proteger esta ruta interna.',
        },
        { status: 500 }
      );
    }

    const token = getBearerToken(request);
    if (!token || !allowedSecrets.includes(token)) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'No autorizado para procesar el outbox de correos.',
        },
        { status: 403 }
      );
    }

    const result = await processPendingEmailNotifications({ limit });
    const status = result.configurationError ? 503 : 200;

    return NextResponse.json(
      {
        ok: !result.configurationError,
        ...result,
      },
      { status }
    );
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

export async function GET(request: NextRequest) {
  return handleProcessRequest(request, readLimitFromQuery(request));
}

export async function POST(request: NextRequest) {
  return handleProcessRequest(request, await readLimitFromBody(request));
}
