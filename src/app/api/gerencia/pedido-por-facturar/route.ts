import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { loadOrderToInvoiceDetail } from '@/lib/gerencia/pedidoPorFacturar.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

// Detalle de un pedido por facturar (Dirección y Super Admin). Solo lectura en Odoo.
export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  try {
    return NextResponse.json(await loadOrderToInvoiceDetail(/^\d{1,10}$/.test(id) ? Number(id) : NaN), { headers: HEADERS });
  } catch (error) {
    if (error instanceof FinancialDataError) return NextResponse.json({ error: error.message }, { status: error.status, headers: HEADERS });
    console.error('[gerencia/pedido-por-facturar]', error);
    return NextResponse.json({ error: 'No se pudo consultar el pedido en Odoo.' }, { status: 502, headers: HEADERS });
  }
}
