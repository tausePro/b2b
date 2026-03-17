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

export async function POST(request: NextRequest) {
  try {
    const internalSecret = process.env.INTERNAL_EMAIL_PROCESSOR_SECRET?.trim() || null;

    if (!internalSecret) {
      return NextResponse.json(
        {
          error: 'INTERNAL_SECRET_NOT_CONFIGURED',
          details: 'Define INTERNAL_EMAIL_PROCESSOR_SECRET para proteger esta ruta interna.',
        },
        { status: 500 }
      );
    }

    const token = getBearerToken(request);
    if (token !== internalSecret) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'No autorizado para procesar el outbox de correos.',
        },
        { status: 403 }
      );
    }

    let limit: number | undefined;
    try {
      const body = (await request.json()) as { limit?: number };
      limit = body.limit;
    } catch {
      limit = undefined;
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
