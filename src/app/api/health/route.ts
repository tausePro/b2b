import { NextResponse } from 'next/server';

// Health endpoint es siempre live data (nunca cacheado).
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Health check simple. Devuelve estado del servicio público.
 * Este endpoint es referenciado por `/.well-known/api-catalog` como el
 * link relation "status" según RFC 9727.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'imprima-public-api',
      timestamp: new Date().toISOString(),
      version: '1',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
