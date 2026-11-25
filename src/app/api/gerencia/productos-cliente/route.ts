import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { userHasAnyRole } from '@/lib/auth/roles';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';
import { purchaseHistoryRange } from '@/lib/compras/historial';
import { FinancialDataError } from '@/lib/gerencia/finanzas.server';
import { getCustomerProducts, searchCustomers } from '@/lib/gerencia/productosCliente.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

// Productos por cliente con precios de venta: Dirección y Super Admin ven todos los clientes;
// la asesora solo los que tiene asignados como vendedora en Odoo. Solo lectura; sin costos ni márgenes.
export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['direccion', 'super_admin', 'asesor']);
  if (auth instanceof NextResponse) return auth;
  try {
    let odooUserId: number | null = null;
    if (!userHasAnyRole(auth.actor, ['direccion', 'super_admin'])) {
      const { data, error } = await auth.admin.from('usuarios').select('odoo_user_id').eq('id', auth.actor.id).maybeSingle();
      if (error) throw new FinancialDataError('No se pudo verificar tu vínculo con Odoo.');
      if (!Number.isSafeInteger(data?.odoo_user_id) || Number(data?.odoo_user_id) <= 0) {
        throw new FinancialDataError('Tu usuario no tiene un vendedor de Odoo vinculado. Pide a Dirección que lo vincule para ver tus clientes.', 409);
      }
      odooUserId = Number(data!.odoo_user_id);
    }
    const scope = odooUserId ? 'propios' : 'todos';
    const params = request.nextUrl.searchParams;
    const customer = params.get('cliente_id');
    if (customer === null) return NextResponse.json({ clientes: await searchCustomers(params.get('buscar') ?? '', odooUserId), alcance: scope }, { headers: HEADERS });
    const defaults = purchaseHistoryRange(getBogotaCalendarDate());
    const report = await getCustomerProducts(/^\d{1,10}$/.test(customer) ? Number(customer) : NaN, {
      from: params.get('desde') || defaults.from, to: params.get('hasta') || defaults.to,
    }, odooUserId);
    return NextResponse.json({ ...report, alcance: scope }, { headers: HEADERS });
  } catch (error) {
    if (!(error instanceof FinancialDataError)) console.error('[gerencia/productos-cliente]', error);
    return NextResponse.json(
      { error: error instanceof FinancialDataError ? error.message : 'No se pudo consultar Odoo.' },
      { status: error instanceof FinancialDataError ? error.status : 502, headers: HEADERS },
    );
  }
}
