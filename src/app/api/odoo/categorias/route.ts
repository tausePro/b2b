import { NextResponse } from 'next/server';
import {
  authenticate,
  getCategoriasProducto,
  getEtiquetasProducto,
  getEtiquetasCliente,
  getConfigFromEnv,
} from '@/lib/odoo/client';

export async function GET() {
  try {
    const config = getConfigFromEnv();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de Odoo no encontrada en variables de entorno' },
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
