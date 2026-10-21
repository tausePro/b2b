import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { getOpenBalanceReport } from '@/lib/gerencia/cartera.server';
import type { BalanceStatus, OpenBalanceFilters } from '@/lib/gerencia/cartera';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get('tipo') ?? 'cobrar';
    const status = params.get('estado') ?? 'all';
    const page = params.get('pagina') ?? '1';
    const search = (params.get('buscar') ?? '').trim();
    if (!['cobrar', 'pagar'].includes(type) || !['all', 'overdue', 'not_due', 'credit', 'no_due_date'].includes(status)
      || !/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)) || search.length > 120) {
      return json({ error: 'Revisa los filtros de cartera.' }, 400);
    }
    const filters: OpenBalanceFilters = {
      side: type === 'cobrar' ? 'receivable' : 'payable', status: status as BalanceStatus, search, page: Number(page),
    };
    const report = await getOpenBalanceReport(filters);
    if (Buffer.byteLength(JSON.stringify(report)) > 3 * 1024 * 1024) {
      throw new FinancialDataError('La respuesta de cartera excede el límite de tamaño. No se muestran saldos incompletos.', 422);
    }
    return json(report);
  } catch (error) {
    if (error instanceof FinancialDataError) return json({ error: error.message }, error.status);
    console.error('[Gerencia cartera] No se pudo completar la lectura de saldos.');
    return json({ error: 'No se pudo consultar la cartera de Odoo. No se muestran saldos incompletos; intenta nuevamente.' }, 502);
  }
}
