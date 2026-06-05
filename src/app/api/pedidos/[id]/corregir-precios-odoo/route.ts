import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  authenticate,
  enforceSaleOrderLinePrices,
  getSaleOrderSummary,
  type EnforceSaleOrderLineInput,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadPricingContext } from '@/lib/pricing/margins';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type PerfilActual = {
  id: string;
  rol: string;
  nombre: string | null;
  apellido: string | null;
};

type PedidoRow = {
  id: string;
  numero: string;
  empresa_id: string | null;
  odoo_sale_order_id: number | null;
};

type ItemRow = {
  odoo_product_id: number | null;
  odoo_variant_id: number | null;
  cantidad: number;
  precio_unitario_cop: number;
};

// Reescribe el price_unit de las líneas de la cotización en Odoo para que
// coincida con el costo+margen guardado en pedido_items. Sirve para corregir
// cotizaciones creadas antes del fix, donde Odoo aplicó la pricelist del partner.
export async function POST(
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
        { error: 'UNAUTHORIZED', details: userError?.message ?? null },
        { status: 401 }
      );
    }

    const { data: perfilData, error: perfilError } = await supabase.rpc('get_mi_perfil');
    if (perfilError || !perfilData) {
      return NextResponse.json(
        { error: 'PROFILE_NOT_FOUND', details: perfilError?.message ?? null },
        { status: 403 }
      );
    }

    const perfil = perfilData as PerfilActual;
    if (!['super_admin', 'direccion'].includes(perfil.rol)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Tu rol no puede corregir precios en Odoo.' },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: pedidoData, error: pedidoError } = await admin
      .from('pedidos')
      .select('id, numero, empresa_id, odoo_sale_order_id')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedidoData) {
      return NextResponse.json(
        { error: 'PEDIDO_NOT_FOUND', details: pedidoError?.message ?? null },
        { status: 404 }
      );
    }

    const pedido = pedidoData as PedidoRow;

    if (!pedido.odoo_sale_order_id) {
      return NextResponse.json(
        { error: 'ODOO_QUOTATION_NOT_FOUND', details: 'El pedido no tiene cotización asociada en Odoo.' },
        { status: 400 }
      );
    }

    if (!pedido.empresa_id) {
      return NextResponse.json(
        { error: 'EMPRESA_MISSING', details: 'El pedido no tiene empresa asociada.' },
        { status: 400 }
      );
    }

    // Solo aplica a clientes costo+margen; en modo pricelist Odoo es la fuente correcta.
    const pricingCtx = await loadPricingContext(pedido.empresa_id);
    if (pricingCtx.modoPricing !== 'costo_margen') {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'El cliente usa lista de precios fija (pricelist); el precio de Odoo es el correcto.',
      });
    }

    const { data: itemsData, error: itemsError } = await admin
      .from('pedido_items')
      .select('odoo_product_id, odoo_variant_id, cantidad, precio_unitario_cop')
      .eq('pedido_id', pedidoId)
      .eq('tipo_item', 'catalogo');

    if (itemsError) {
      return NextResponse.json(
        { error: 'PEDIDO_ITEMS_ERROR', details: itemsError.message },
        { status: 500 }
      );
    }

    const desiredLines: EnforceSaleOrderLineInput[] = ((itemsData as ItemRow[]) || [])
      .filter((item) => item.odoo_product_id && Number(item.precio_unitario_cop) > 0)
      .map((item) => ({
        templateId: Number(item.odoo_product_id),
        variantId: item.odoo_variant_id ? Number(item.odoo_variant_id) : null,
        quantity: Number(item.cantidad),
        priceUnit: Number(item.precio_unitario_cop),
      }));

    if (desiredLines.length === 0) {
      return NextResponse.json(
        { error: 'NO_CATALOG_ITEMS', details: 'No hay ítems de catálogo con precio para corregir.' },
        { status: 400 }
      );
    }

    const odooConfig = await getServerOdooConfig();
    if (!odooConfig) {
      return NextResponse.json(
        { error: 'ODOO_CONFIG_MISSING', details: 'No hay configuración de Odoo disponible en el servidor.' },
        { status: 500 }
      );
    }

    const session = await authenticate(odooConfig);
    const result = await enforceSaleOrderLinePrices(
      session,
      Number(pedido.odoo_sale_order_id),
      desiredLines
    );
    const summary = await getSaleOrderSummary(session, Number(pedido.odoo_sale_order_id));

    await admin.from('logs_trazabilidad').insert({
      pedido_id: pedidoId,
      accion: 'edicion',
      descripcion: `Precios corregidos en Odoo (costo+margen). Líneas ajustadas: ${result.updatedLines}. Subtotal Odoo: ${result.amountUntaxedBefore} → ${result.amountUntaxedAfter}.`,
      usuario_id: perfil.id,
      usuario_nombre: [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || user.email || 'Usuario',
      metadata: {
        odoo_sale_order_id: pedido.odoo_sale_order_id,
        updated_lines: result.updatedLines,
        amount_untaxed_before: result.amountUntaxedBefore,
        amount_untaxed_after: result.amountUntaxedAfter,
      },
    });

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedido.id,
        numero: pedido.numero,
        odoo_sale_order_id: pedido.odoo_sale_order_id,
      },
      result,
      odoo_sale_order: summary,
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
