import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { defaultFinancialRange, validateFinancialRange, type FinancialFilters } from '@/lib/gerencia/finanzas';
import { FinancialDataError, getFinancialReport } from '@/lib/gerencia/finanzas.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}

function positiveId(value: string | null, field: string): number | undefined {
  if (value === null) return undefined;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new FinancialDataError(`El filtro ${field} no es válido.`, 400);
  return Number(value);
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['direccion', 'super_admin']);
  if (auth instanceof NextResponse) return auth;
  try {
    const params = request.nextUrl.searchParams;
    const defaults = defaultFinancialRange();
    let range;
    try { range = validateFinancialRange(params.get('desde') ?? defaults.from, params.get('hasta') ?? defaults.to); }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'Rango de fechas inválido.' }, 400); }
    const filters: FinancialFilters = {
      advisorId: params.get('asesora') === 'none' ? null : positiveId(params.get('asesora'), 'asesora'),
      clientId: positiveId(params.get('cliente'), 'cliente'), productId: positiveId(params.get('producto'), 'producto'),
      invoiceId: positiveId(params.get('factura'), 'factura'), page: positiveId(params.get('pagina'), 'página') ?? 1,
    };
    const report = await getFinancialReport(auth.admin, range, filters);
    if (Buffer.byteLength(JSON.stringify(report)) > 3 * 1024 * 1024) {
      throw new FinancialDataError('El reporte es demasiado grande. Reduce el rango o selecciona una asesora o cliente.', 422);
    }
    return json(report);
  } catch (error) {
    if (error instanceof FinancialDataError) return json({ error: error.message }, error.status);
    console.error('[Gerencia finanzas] No se pudo completar la lectura financiera.');
    return json({ error: 'No se pudo completar la consulta financiera en Odoo. No se muestran cifras parciales; intenta nuevamente.' }, 502);
  }
}
