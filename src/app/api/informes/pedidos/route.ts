import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { getOrderMetricsReport, OrderReportError } from '@/lib/informes/pedidos.server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles([
    'comprador',
    'aprobador',
    'asesor',
    'direccion',
    'super_admin',
  ]);
  if (auth instanceof NextResponse) return auth;

  try {
    const params = request.nextUrl.searchParams;
    const report = await getOrderMetricsReport(auth, {
      empresaId: params.get('empresa_id'),
      sedeId: params.get('sede_id'),
      estado: params.get('estado'),
      desde: params.get('desde'),
      hasta: params.get('hasta'),
    });

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const status = error instanceof OrderReportError ? error.status : 500;
    const message =
      error instanceof OrderReportError
        ? error.message
        : 'No se pudo generar el informe de pedidos.';

    return NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
