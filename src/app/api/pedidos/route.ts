import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { authenticate, createSaleOrderQuotation, read } from '@/lib/odoo/client';
import { mergePedidoNoteWithSpecialItems, normalizeTipoPedidoItem, partitionPedidoItems } from '@/lib/pedidoItems';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { safeEnqueuePedidoNotifications } from '@/lib/notifications/pedidos';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { TipoPedidoItem } from '@/types';

type PerfilActual = {
  id: string;
  rol: string;
  empresa_id: string | null;
  sede_id: string | null;
  nombre: string | null;
  apellido: string | null;
};

type CreatePedidoItemInput = {
  tipo_item: TipoPedidoItem;
  odoo_product_id: number | null;
  odoo_variant_id?: number | null;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
  unidad?: string | null;
  referencia_cliente?: string | null;
  comentarios_item?: string | null;
};

type CreatePedidoRequest = {
  comentarios_sede?: string | null;
  items: CreatePedidoItemInput[];
};

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isValidItem(item: CreatePedidoItemInput) {
  if (item.tipo_item === 'especial') {
    return (
      Number.isFinite(item.cantidad) &&
      Number.isFinite(item.precio_unitario_cop) &&
      item.odoo_product_id === null &&
      item.cantidad > 0 &&
      item.precio_unitario_cop >= 0 &&
      Boolean(item.nombre_producto?.trim())
    );
  }

  return (
    Number.isFinite(item.odoo_product_id) &&
    Number.isFinite(item.cantidad) &&
    Number.isFinite(item.precio_unitario_cop) &&
    (item.odoo_product_id ?? 0) > 0 &&
    item.cantidad > 0 &&
    item.precio_unitario_cop >= 0 &&
    Boolean(item.nombre_producto?.trim())
  );
}

function normalizeCreatePedidoItemInput(item: Partial<CreatePedidoItemInput>): CreatePedidoItemInput {
  const tipo_item = normalizeTipoPedidoItem(item.tipo_item);
  const rawOdooProductId = item.odoo_product_id;
  const odoo_product_id = tipo_item === 'catalogo' && rawOdooProductId !== null && rawOdooProductId !== undefined
    ? Number(rawOdooProductId)
    : null;

  const rawVariantId = (item as Record<string, unknown>).odoo_variant_id;
  const odoo_variant_id = tipo_item === 'catalogo' && rawVariantId !== null && rawVariantId !== undefined
    ? Number(rawVariantId)
    : null;

  return {
    tipo_item,
    odoo_product_id,
    odoo_variant_id: Number.isFinite(odoo_variant_id) && odoo_variant_id! > 0 ? odoo_variant_id : null,
    nombre_producto: typeof item.nombre_producto === 'string' ? item.nombre_producto.trim() : '',
    cantidad: Number(item.cantidad),
    precio_unitario_cop: Number(item.precio_unitario_cop ?? 0),
    unidad: typeof item.unidad === 'string' ? item.unidad.trim() || null : null,
    referencia_cliente: typeof item.referencia_cliente === 'string' ? item.referencia_cliente.trim() || null : null,
    comentarios_item: typeof item.comentarios_item === 'string' ? item.comentarios_item.trim() || null : null,
  };
}

export async function POST(request: NextRequest) {
  try {
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
    if (perfil.rol !== 'comprador') {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Solo los compradores pueden crear pedidos.' },
        { status: 403 }
      );
    }

    if (!perfil.empresa_id) {
      return NextResponse.json(
        { error: 'INVALID_PROFILE', details: 'El usuario no tiene empresa asignada.' },
        { status: 422 }
      );
    }

    const body = (await request.json()) as CreatePedidoRequest;
    const items = Array.isArray(body.items)
      ? body.items.map((item) => normalizeCreatePedidoItemInput(item))
      : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'EMPTY_ORDER', details: 'El pedido debe incluir al menos un item.' },
        { status: 422 }
      );
    }

    if (!items.every(isValidItem)) {
      return NextResponse.json(
        { error: 'INVALID_ITEMS', details: 'Uno o más items del pedido son inválidos.' },
        { status: 422 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: empresa, error: empresaError } = await admin
      .from('empresas')
      .select('id, nombre, requiere_aprobacion, usa_sedes, odoo_partner_id, odoo_comercial_id')
      .eq('id', perfil.empresa_id)
      .single();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { error: 'COMPANY_NOT_FOUND', details: empresaError?.message ?? null },
        { status: 404 }
      );
    }

    let sedeId: string | null = null;
    let sedeData: { id: string; nombre_sede: string; direccion: string | null; ciudad: string | null; odoo_address_id: number | null } | null = null;
    if (empresa.usa_sedes) {
      if (!perfil.sede_id) {
        return NextResponse.json(
          { error: 'SEDE_REQUIRED', details: 'Tu empresa opera con sedes y tu usuario no tiene una sede asignada.' },
          { status: 422 }
        );
      }

      const { data: sede, error: sedeError } = await admin
        .from('sedes')
        .select('id, nombre_sede, direccion, ciudad, odoo_address_id')
        .eq('id', perfil.sede_id)
        .eq('empresa_id', perfil.empresa_id)
        .maybeSingle();

      if (sedeError || !sede) {
        return NextResponse.json(
          { error: 'INVALID_SEDE', details: sedeError?.message ?? 'La sede asignada no es válida para la empresa.' },
          { status: 422 }
        );
      }

      sedeId = perfil.sede_id;
      sedeData = sede;
    }

    const totalItems = items.reduce((sum, item) => sum + item.cantidad, 0);
    const valorTotal = items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario_cop, 0);

    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .insert({
        empresa_id: perfil.empresa_id,
        sede_id: sedeId,
        usuario_creador_id: perfil.id,
        comentarios_sede: body.comentarios_sede?.trim() || null,
        valor_total_cop: valorTotal,
        total_items: totalItems,
      })
      .select('id, numero, estado, fecha_aprobacion')
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: 'PEDIDO_CREATE_ERROR', details: pedidoError?.message ?? null },
        { status: 500 }
      );
    }

    const itemsData = items.map((item) => ({
      pedido_id: pedido.id,
      odoo_product_id: item.odoo_product_id,
      odoo_variant_id: item.odoo_variant_id || null,
      tipo_item: item.tipo_item,
      nombre_producto: item.nombre_producto.trim(),
      cantidad: item.cantidad,
      precio_unitario_cop: item.precio_unitario_cop,
      unidad: item.unidad,
      referencia_cliente: item.referencia_cliente,
      comentarios_item: item.comentarios_item,
    }));

    const { error: itemsError } = await admin.from('pedido_items').insert(itemsData);
    if (itemsError) {
      await admin.from('pedidos').delete().eq('id', pedido.id);
      return NextResponse.json(
        { error: 'PEDIDO_ITEMS_CREATE_ERROR', details: itemsError.message },
        { status: 500 }
      );
    }

    const nombreUsuario = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || user.email || 'Usuario';
    const flujoEsAprobacion = pedido.estado === 'en_aprobacion';

    const { error: logError } = await admin.from('logs_trazabilidad').insert({
      pedido_id: pedido.id,
      accion: 'creacion',
      descripcion: flujoEsAprobacion
        ? `Pedido creado y enviado a aprobación con ${totalItems} items`
        : `Pedido creado con aprobación automática (${totalItems} items)`,
      usuario_id: perfil.id,
      usuario_nombre: nombreUsuario,
      metadata: {
        requiere_aprobacion: empresa.requiere_aprobacion,
        total_items: totalItems,
        valor_total_cop: valorTotal,
      },
    });

    const notificationResult = await safeEnqueuePedidoNotifications({
      actorUserId: perfil.id,
      event: flujoEsAprobacion ? 'pedido_creado_en_aprobacion' : 'pedido_creado_autoaprobado',
      pedidoId: pedido.id,
    });

    const odooSyncResult: { odoo_sale_order_id: number | null; odoo_warning: string | null } = {
      odoo_sale_order_id: null,
      odoo_warning: null,
    };

    // Si es auto-aprobado y la empresa tiene odoo_partner_id, enviar a Odoo
    if (!flujoEsAprobacion && empresa.odoo_partner_id) {
      try {
        const odooConfig = await getServerOdooConfig();
        if (!odooConfig) {
          odooSyncResult.odoo_warning = 'No hay configuración de Odoo disponible.';
        } else {
          const session = await authenticate(odooConfig);
          const partnerRows = await read(
            'res.partner',
            [Number(empresa.odoo_partner_id)],
            ['id', 'property_product_pricelist'],
            session
          );
          const partner = partnerRows[0];
          const partnerPricelist = Array.isArray(partner?.property_product_pricelist)
            ? Number(partner.property_product_pricelist[0])
            : null;

          const noteLines = [
            `Pedido B2B ${pedido.numero}`,
            sedeData?.nombre_sede ? `Sede: ${sedeData.nombre_sede}` : null,
            sedeData?.direccion ? `Dirección: ${sedeData.direccion}` : null,
            sedeData?.ciudad ? `Ciudad: ${sedeData.ciudad}` : null,
            body.comentarios_sede?.trim() ? `Comentarios: ${body.comentarios_sede.trim()}` : null,
          ].filter(Boolean).join('\n');

          const { catalogItems, specialItems } = partitionPedidoItems(items);

          const quotation = await createSaleOrderQuotation(session, {
            partnerId: Number(empresa.odoo_partner_id),
            invoicePartnerId: Number(empresa.odoo_partner_id),
            shippingPartnerId: sedeData?.odoo_address_id ? Number(sedeData.odoo_address_id) : Number(empresa.odoo_partner_id),
            pricelistId: partnerPricelist,
            salespersonId: empresa.odoo_comercial_id ? Number(empresa.odoo_comercial_id) : null,
            clientReference: `${pedido.numero} (${pedido.id.slice(0, 8)})`,
            origin: pedido.numero,
            dateOrder: new Date().toISOString(),
            note: mergePedidoNoteWithSpecialItems(noteLines || null, specialItems),
            lines: catalogItems.map((item) => ({
              productTemplateId: Number(item.odoo_product_id),
              productId: item.odoo_variant_id ? Number(item.odoo_variant_id) : undefined,
              name: item.nombre_producto.trim(),
              quantity: Number(item.cantidad),
              priceUnit: Number(item.precio_unitario_cop),
            })),
          });

          odooSyncResult.odoo_sale_order_id = quotation.id;

          await admin
            .from('pedidos')
            .update({
              estado: 'procesado_odoo',
              odoo_sale_order_id: quotation.id,
            })
            .eq('id', pedido.id);

          await admin.from('logs_trazabilidad').insert({
            pedido_id: pedido.id,
            accion: 'aprobacion',
            descripcion: quotation.existing
              ? `Pedido auto-aprobado, cotización existente en Odoo (${quotation.name || quotation.id}).`
              : `Pedido auto-aprobado y cotización creada en Odoo (${quotation.name || quotation.id}).`,
            usuario_id: perfil.id,
            usuario_nombre: nombreUsuario,
            metadata: {
              odoo_sale_order_id: quotation.id,
              odoo_sale_order_name: quotation.name,
              odoo_state: quotation.state,
              existing: quotation.existing,
              auto_aprobado: true,
            },
          });

          await safeEnqueuePedidoNotifications({
            actorUserId: perfil.id,
            event: 'pedido_procesado_odoo',
            pedidoId: pedido.id,
          });
        }
      } catch (odooError) {
        odooSyncResult.odoo_warning = odooError instanceof Error ? odooError.message : 'Error al sincronizar con Odoo';
        console.error('[Pedido Auto-Aprobado] Error Odoo:', odooError);
      }
    }

    const warning = [logError?.message, notificationResult.error, odooSyncResult.odoo_warning].filter(Boolean).join(' | ') || null;

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedido.id,
        numero: pedido.numero,
        estado: odooSyncResult.odoo_sale_order_id ? 'procesado_odoo' : pedido.estado,
        fecha_aprobacion: pedido.fecha_aprobacion,
        odoo_sale_order_id: odooSyncResult.odoo_sale_order_id,
      },
      notifications: notificationResult.result,
      warning,
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
