import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import { defaultLiquidationMonth, isMonth } from '@/lib/plataforma/liquidacion';
import { getPlatformLiquidation } from '@/lib/plataforma/liquidacion.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

// Liquidación mensual de la plataforma (acuerdo Tause–Imprima). Solo lectura en Odoo y Supabase.
export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['super_admin', 'direccion']);
  if (auth instanceof NextResponse) return auth;
  const today = getBogotaCalendarDate();
  const month = request.nextUrl.searchParams.get('mes') ?? defaultLiquidationMonth(today);
  if (!isMonth(month) || month > today.slice(0, 7) || month < '2026-01') {
    return NextResponse.json({ error: 'El mes no es válido.' }, { status: 400, headers: HEADERS });
  }
  try {
    return NextResponse.json({ ...await getPlatformLiquidation(auth.admin, month, today), currentMonth: today.slice(0, 7) }, { headers: HEADERS });
  } catch (error) {
    console.error('[plataforma/liquidacion]', error);
    return NextResponse.json({ error: 'No se pudo calcular la liquidación. Intenta de nuevo en unos minutos.' }, { status: 502, headers: HEADERS });
  }
}
