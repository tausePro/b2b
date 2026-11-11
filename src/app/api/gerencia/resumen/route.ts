import { NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { salesOnlySummary } from '@/lib/gerencia/resumen';
import { loadExecutiveSummary } from '@/lib/gerencia/resumen.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const auth = await authorizeApiRoles(['direccion', 'super_admin', 'cartera']);
  if (auth instanceof NextResponse) return auth;
  const fullAccess = [auth.actor.rol, ...auth.actor.rolesExtra].some(role => role === 'direccion' || role === 'super_admin');
  try {
    const summary = await loadExecutiveSummary();
    return NextResponse.json(fullAccess ? summary : salesOnlySummary(summary), { headers: HEADERS });
  } catch (error) {
    if (!(error instanceof FinancialDataError)) console.error('[gerencia/resumen]', error);
    return NextResponse.json(
      { error: error instanceof FinancialDataError ? error.message : 'No se pudo consultar el resumen ejecutivo en Odoo.' },
      { status: error instanceof FinancialDataError ? error.status : 502, headers: HEADERS },
    );
  }
}
