import { NextResponse } from 'next/server';
import { authenticate, getPricelists } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';

export async function GET() {
  try {
    const config = await getServerOdooConfig();
    if (!config) {
      return NextResponse.json({ error: 'Configuración de Odoo no encontrada' }, { status: 500 });
    }

    const session = await authenticate(config);
    const pricelists = await getPricelists(session);

    return NextResponse.json({
      pricelists: pricelists.map((pl) => ({
        id: pl.id,
        name: pl.name,
        currency: Array.isArray(pl.currency_id) ? pl.currency_id[1] : null,
      })),
    });
  } catch (err) {
    console.error('[API /odoo/pricelists]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
