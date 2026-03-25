import { NextResponse } from 'next/server';
import {
  authenticate,
  getCategoriasProducto,
  getEtiquetasProducto,
  getEtiquetasCliente,
} from '@/lib/odoo/client';
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

    const [categorias, etiquetasProducto, etiquetasCliente] = await Promise.all([
      getCategoriasProducto(session),
      getEtiquetasProducto(session),
      getEtiquetasCliente(session),
    ]);

    return NextResponse.json({
      categorias,
      etiquetas_producto: etiquetasProducto,
      etiquetas_cliente: etiquetasCliente,
    });
  } catch (err) {
    console.error('[API /odoo/categorias]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
