import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import { purchaseHistoryRange } from '@/lib/compras/historial';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { getCustomerProducts, searchCustomers } from '@/lib/gerencia/productosCliente.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  try {
    const params = request.nextUrl.searchParams;
    const customer = params.get('cliente_id');
    if (customer === null) return NextResponse.json({ clientes: await searchCustomers(params.get('buscar') ?? '') }, { headers: HEADERS });
    const defaults = purchaseHistoryRange(getBogotaCalendarDate());
    const report = await getCustomerProducts(/^\d{1,10}$/.test(customer) ? Number(customer) : NaN, {
      from: params.get('desde') || defaults.from, to: params.get('hasta') || defaults.to,
    });
    return NextResponse.json(report, { headers: HEADERS });
  } catch (error) {
    if (!(error instanceof FinancialDataError)) console.error('[gerencia/productos-cliente]', error);
    return NextResponse.json(
      { error: error instanceof FinancialDataError ? error.message : 'No se pudo consultar Odoo.' },
      { status: error instanceof FinancialDataError ? error.status : 502, headers: HEADERS },
    );
  }
}
