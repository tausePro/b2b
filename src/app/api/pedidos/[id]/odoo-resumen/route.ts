import { NextRequest, NextResponse } from 'next/server';
import * as odooClientModule from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type PerfilActual = {
  rol: string;
  empresa_id: string | null;
};

type PedidoOdooResumen = {
  id: string;
  numero: string;
  odoo_sale_order_id: number | null;
};

const odooClient = (
  odooClientModule as typeof odooClientModule & {
    default?: typeof odooClientModule;
  }
).default ?? odooClientModule;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pedidoId } = await context.params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          details: userError?.message ?? null,
        },
        { status: 401 }
      );
    }

    const { data: perfilData, error: perfilError } = await supabase.rpc('get_mi_perfil');
    if (perfilError || !perfilData) {
      return NextResponse.json(
        {
          error: 'PROFILE_NOT_FOUND',
          details: perfilError?.message ?? null,
        },
        { status: 403 }
      );
    }

    const perfil = perfilData as PerfilActual;
    let canShowPrices = ['super_admin', 'aprobador', 'asesor', 'direccion'].includes(perfil.rol);

    if (perfil.empresa_id && ['comprador', 'aprobador'].includes(perfil.rol)) {
      const { data: configEmpresa } = await supabase
        .from('empresa_configs')
        .select('configuracion_extra')
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();

      const extra =
        configEmpresa?.configuracion_extra && typeof configEmpresa.configuracion_extra === 'object'
          ? (configEmpresa.configuracion_extra as Record<string, unknown>)
          : {};

      if (perfil.rol === 'comprador' && typeof extra.mostrar_precios_comprador === 'boolean') {
        canShowPrices = extra.mostrar_precios_comprador;
      }

      if (perfil.rol === 'aprobador' && typeof extra.mostrar_precios_aprobador === 'boolean') {
        canShowPrices = extra.mostrar_precios_aprobador;
      }
    }

    if (!canShowPrices) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'Tu perfil no tiene permisos para ver montos.',
        },
        { status: 403 }
      );
    }

    const { data: pedidoData, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, numero, odoo_sale_order_id')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedidoData) {
      return NextResponse.json(
        {
          error: 'PEDIDO_NOT_FOUND',
          details: pedidoError?.message ?? null,
        },
        { status: 404 }
      );
    }

    const pedido = pedidoData as PedidoOdooResumen;
    if (!pedido.odoo_sale_order_id) {
      return NextResponse.json(
        {
          error: 'ODOO_QUOTATION_NOT_FOUND',
          details: 'El pedido aún no tiene una cotización asociada en Odoo.',
        },
        { status: 400 }
      );
    }

    const odooConfig = await getServerOdooConfig();
    if (!odooConfig) {
      return NextResponse.json(
        {
          error: 'ODOO_CONFIG_MISSING',
          details: 'No hay configuración de Odoo disponible en el servidor.',
        },
        { status: 500 }
      );
    }

    const session = await odooClient.authenticate(odooConfig);
    const odooSaleOrder = await odooClient.getSaleOrderSummary(
      session,
      Number(pedido.odoo_sale_order_id)
    );

    if (!odooSaleOrder) {
      return NextResponse.json(
        {
          error: 'ODOO_SALE_ORDER_NOT_FOUND',
          details: `No se encontró la cotización ${pedido.odoo_sale_order_id} en Odoo.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedido.id,
        numero: pedido.numero,
        odoo_sale_order_id: pedido.odoo_sale_order_id,
      },
      odoo_sale_order: odooSaleOrder,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
