import { NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { loadExecutiveSummary } from '@/lib/gerencia/resumen.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const auth = await authorizeApiRoles(['direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await loadExecutiveSummary(), { headers: HEADERS });
  } catch (error) {
    if (!(error instanceof FinancialDataError)) console.error('[gerencia/resumen]', error);
    return NextResponse.json(
      { error: error instanceof FinancialDataError ? error.message : 'No se pudo consultar el resumen ejecutivo en Odoo.' },
      { status: error instanceof FinancialDataError ? error.status : 502, headers: HEADERS },
    );
  }
}
