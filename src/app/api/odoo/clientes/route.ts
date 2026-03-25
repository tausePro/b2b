import { NextResponse } from 'next/server';
import { authenticate, getClientes, getEtiquetasCliente } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';

export async function GET() {
  try {
    const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
    if (authorized instanceof NextResponse) {
      return authorized;
    }

    const config = await getServerOdooConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de Odoo no encontrada' },
        { status: 500 }
      );
    }

    const session = await authenticate(config);

    const [clientes, etiquetas] = await Promise.all([
      getClientes(session),
      getEtiquetasCliente(session),
    ]);

    return NextResponse.json({ clientes, etiquetas, total: clientes.length });
  } catch (err) {
    console.error('[API /odoo/clientes]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
