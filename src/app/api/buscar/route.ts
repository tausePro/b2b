import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import { searchPortal } from '@/lib/busqueda/buscar.server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRoles(['super_admin', 'direccion', 'asesor', 'compras', 'cartera', 'editor_contenido']);
  if (auth instanceof NextResponse) return auth;
  const result = await searchPortal([auth.actor.rol, ...auth.actor.rolesExtra], request.nextUrl.searchParams.get('q') ?? '');
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}
