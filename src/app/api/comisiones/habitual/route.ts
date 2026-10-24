import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import { getRegularCommissionReport } from '@/lib/comisiones/habitual.server';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization' } });
}

export async function GET(request: NextRequest) {
  const context = await authorizeApiRoles(['asesor', 'direccion', 'super_admin']);
  if (context instanceof NextResponse) return context;
  try {
    const period = request.nextUrl.searchParams.get('periodo') ?? getBogotaCalendarDate().slice(0, 7);
    return json(await getRegularCommissionReport(context, period, request.nextUrl.searchParams.get('asesor_id')));
  } catch (error) {
    if (error instanceof FinancialDataError) return json({ error: error.message }, error.status);
    console.error('[Comisión habitual] No se pudo completar la consulta.');
    return json({ error: 'No se pudo consultar la comisión habitual en Odoo. Intenta actualizar.' }, 502);
  }
}
