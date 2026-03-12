import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { authenticate, createSaleOrderQuotation, read } from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type PerfilActual = {
  id: string;
  rol: string;
  empresa_id: string | null;
  nombre: string | null;
  apellido: string | null;
};

type PedidoEmpresa = {
  id: string;
  nombre: string;
  odoo_partner_id: number;
  odoo_comercial_id: number | null;
};

type PedidoSede = {
  id: string;
  nombre_sede: string;
  direccion: string | null;
  ciudad: string | null;
  odoo_address_id: number | null;
};

type PedidoDetalle = {
  id: string;
  numero: string;
  estado: string;
  empresa_id: string;
  sede_id: string | null;
  odoo_sale_order_id: number | null;
  comentarios_sede: string | null;
  comentarios_aprobador: string | null;
  fecha_creacion: string;
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
  empresa: PedidoEmpresa | null;
  sede: PedidoSede | null;
};

type PedidoItem = {
  id: string;
  odoo_product_id: number | null;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
};

function buildQuotationNote(pedido: PedidoDetalle): string | null {
  const lines = [
    `Pedido B2B ${pedido.numero}`,
    pedido.sede?.nombre_sede ? `Sede: ${pedido.sede.nombre_sede}` : null,
    pedido.sede?.direccion ? `Dirección: ${pedido.sede.direccion}` : null,
    pedido.sede?.ciudad ? `Ciudad: ${pedido.sede.ciudad}` : null,
    pedido.comentarios_sede ? `Comentarios sede: ${pedido.comentarios_sede}` : null,
    pedido.comentarios_aprobador ? `Comentarios aprobación: ${pedido.comentarios_aprobador}` : null,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return lines.length > 0 ? lines.join('\n') : null;
}

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
    if (!['aprobador', 'super_admin', 'direccion'].includes(perfil.rol)) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'Tu rol no puede aprobar pedidos.',
        },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: pedidoData, error: pedidoError } = await admin
      .from('pedidos')
      .select(`
        id,
        numero,
        estado,
        empresa_id,
        sede_id,
        odoo_sale_order_id,
        comentarios_sede,
        comentarios_aprobador,
        fecha_creacion,
        aprobado_por,
        fecha_aprobacion,
        empresa:empresas(id, nombre, odoo_partner_id, odoo_comercial_id),
        sede:sedes(id, nombre_sede, direccion, ciudad, odoo_address_id)
      `)
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

    const pedido = pedidoData as unknown as PedidoDetalle;

    if (perfil.rol === 'aprobador' && perfil.empresa_id !== pedido.empresa_id) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'No tienes acceso a este pedido.',
        },
        { status: 403 }
      );
    }

    if (pedido.odoo_sale_order_id) {
      return NextResponse.json({
        ok: true,
        already_synced: true,
        pedido: {
          id: pedido.id,
          estado: pedido.estado,
          odoo_sale_order_id: pedido.odoo_sale_order_id,
        },
      });
    }

    if (!['en_aprobacion', 'aprobado'].includes(pedido.estado)) {
      return NextResponse.json(
        {
          error: 'INVALID_STATE',
          details: `El pedido ${pedido.numero} está en estado ${pedido.estado} y no se puede aprobar.` ,
        },
        { status: 409 }
      );
    }

    if (!pedido.empresa?.odoo_partner_id) {
      return NextResponse.json(
        {
          error: 'ODOO_PARTNER_MISSING',
          details: 'La empresa no tiene odoo_partner_id configurado.',
        },
        { status: 400 }
      );
    }

    const { data: itemsData, error: itemsError } = await admin
      .from('pedido_items')
      .select('id, odoo_product_id, nombre_producto, cantidad, precio_unitario_cop')
      .eq('pedido_id', pedidoId)
      .order('created_at');

    if (itemsError) {
      return NextResponse.json(
        {
          error: 'PEDIDO_ITEMS_ERROR',
          details: itemsError.message,
        },
        { status: 500 }
      );
    }

    const items = (itemsData || []) as PedidoItem[];
    if (items.length === 0) {
      return NextResponse.json(
        {
          error: 'PEDIDO_EMPTY',
          details: 'El pedido no tiene ítems para enviar a Odoo.',
        },
        { status: 400 }
      );
    }

    const invalidItems = items.filter((item) => {
      const templateId = Number(item.odoo_product_id);
      return !Number.isFinite(templateId) || templateId <= 0;
    });

    if (invalidItems.length > 0) {
      return NextResponse.json(
        {
          error: 'ODOO_PRODUCT_MISSING',
          details: `Hay ítems sin odoo_product_id válido: ${invalidItems.map((item) => item.nombre_producto).join(', ')}`,
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

    const session = await authenticate(odooConfig);
    const partnerRows = await read(
      'res.partner',
      [Number(pedido.empresa.odoo_partner_id)],
      ['id', 'property_product_pricelist'],
      session
    );

    const partner = partnerRows[0];
    const partnerPricelist = Array.isArray(partner?.property_product_pricelist)
      ? Number(partner.property_product_pricelist[0])
      : null;

    const quotation = await createSaleOrderQuotation(session, {
      partnerId: Number(pedido.empresa.odoo_partner_id),
      invoicePartnerId: Number(pedido.empresa.odoo_partner_id),
      shippingPartnerId: pedido.sede?.odoo_address_id ? Number(pedido.sede.odoo_address_id) : Number(pedido.empresa.odoo_partner_id),
      pricelistId: partnerPricelist,
      salespersonId: pedido.empresa.odoo_comercial_id ? Number(pedido.empresa.odoo_comercial_id) : null,
      clientReference: pedido.numero,
      origin: pedido.numero,
      dateOrder: pedido.fecha_creacion,
      note: buildQuotationNote(pedido),
      lines: items.map((item) => ({
        productTemplateId: Number(item.odoo_product_id),
        name: item.nombre_producto,
        quantity: Number(item.cantidad),
        priceUnit: Number(item.precio_unitario_cop),
      })),
    });

    const approvalTimestamp = pedido.fecha_aprobacion ?? new Date().toISOString();
    const { error: updateError } = await admin
      .from('pedidos')
      .update({
        estado: 'aprobado',
        aprobado_por: pedido.aprobado_por ?? perfil.id,
        fecha_aprobacion: approvalTimestamp,
        odoo_sale_order_id: quotation.id,
      })
      .eq('id', pedidoId);

    if (updateError) {
      return NextResponse.json(
        {
          error: 'PEDIDO_UPDATE_ERROR',
          details: updateError.message,
          odoo_sale_order_id: quotation.id,
        },
        { status: 500 }
      );
    }

    const { error: logError } = await admin.from('logs_trazabilidad').insert({
      pedido_id: pedidoId,
      accion: 'aprobacion',
      descripcion: quotation.existing
        ? `Pedido aprobado y cotización existente detectada en Odoo (${quotation.name || quotation.id}).`
        : `Pedido aprobado y cotización creada en Odoo (${quotation.name || quotation.id}).`,
      usuario_id: perfil.id,
      usuario_nombre: [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || user.email || 'Usuario',
      metadata: {
        odoo_sale_order_id: quotation.id,
        odoo_sale_order_name: quotation.name,
        odoo_state: quotation.state,
        existing: quotation.existing,
      },
    });

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedidoId,
        estado: 'aprobado',
        fecha_aprobacion: approvalTimestamp,
        odoo_sale_order_id: quotation.id,
      },
      odoo_sale_order: quotation,
      warning: logError ? logError.message : null,
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
