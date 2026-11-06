import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { getProductPurchaseHistory, searchPurchaseProducts } from '@/lib/compras/historial.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };
const PURCHASE_HISTORY_ROLES = ['super_admin', 'direccion', 'asesor', 'compras'] as const;

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(PURCHASE_HISTORY_ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const params = request.nextUrl.searchParams;
    const productParam = params.get('producto_id');
    const data = productParam !== null
      ? await getProductPurchaseHistory(/^\d{1,10}$/.test(productParam) ? Number(productParam) : NaN)
      : await searchPurchaseProducts(params.get('buscar') ?? '');
    return NextResponse.json(data, { headers: HEADERS });
  } catch (error) {
    const status = error instanceof FinancialDataError ? error.status : 502;
    const message = error instanceof FinancialDataError ? error.message : 'No se pudo consultar el historial de compras en Odoo.';
    if (!(error instanceof FinancialDataError)) console.error('[compras/historial]', error);
    return NextResponse.json({ error: message }, { status, headers: HEADERS });
  }
}
