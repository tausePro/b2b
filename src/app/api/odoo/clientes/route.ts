import { NextResponse } from 'next/server';
import { authenticate, getClientes, getEtiquetasCliente, getConfigFromEnv } from '@/lib/odoo/client';

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
