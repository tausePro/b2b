import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { authenticate, createSaleOrderQuotation, read, resolvePricelistPrice } from '@/lib/odoo/client';
import { mergePedidoNoteWithSpecialItems, normalizeTipoPedidoItem, partitionPedidoItems } from '@/lib/pedidoItems';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { safeEnqueuePedidoNotifications } from '@/lib/notifications/pedidos';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadPricingContext, resolveProductPrice, type ModoPricing } from '@/lib/pricing/margins';
import { loadEmpresaPricelistRules } from '@/lib/pricing/pricelist';
import { getClientCompanyAccess } from '@/lib/auth/companyMemberships.server';
import { validateOrderCompanyContext } from '@/lib/auth/companyContext';
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
  idempotency_key?: string | null;
  empresa_id?: string | null;
  sede_id?: string | null;
  comentarios_sede?: string | null;
  items: CreatePedidoItemInput[];
  guardar_como_borrador?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const body = (await request.json()) as CreatePedidoRequest;
    const requestedCompanyId = typeof body.empresa_id === 'string' && body.empresa_id.trim()
      ? body.empresa_id.trim()
      : perfil.empresa_id;

    if (!requestedCompanyId) {
      return NextResponse.json(
        { error: 'INVALID_PROFILE', details: 'El usuario no tiene empresa asignada.' },
        { status: 422 }
      );
    }

    const admin = getSupabaseAdmin();
    const companyAccess = await getClientCompanyAccess(admin, perfil.id, requestedCompanyId);
    if (!companyAccess) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'No tienes acceso a la empresa seleccionada.' },
        { status: 403 }
      );
    }

    const idempotencyKey = typeof body.idempotency_key === 'string'
      ? body.idempotency_key.trim()
      : null;
    if (idempotencyKey && !UUID_PATTERN.test(idempotencyKey)) {
      return NextResponse.json(
        { error: 'INVALID_IDEMPOTENCY_KEY', details: 'La llave de idempotencia no es un UUID válido.' },
        { status: 422 }
      );
    }

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

    const { data: empresa, error: empresaError } = await admin
      .from('empresas')
      .select('id, nombre, requiere_aprobacion, usa_sedes, odoo_partner_id, odoo_comercial_id')
      .eq('id', requestedCompanyId)
      .single();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { error: 'COMPANY_NOT_FOUND', details: empresaError?.message ?? null },
        { status: 404 }
      );
    }

    const requestedSiteId = typeof body.sede_id === 'string' && body.sede_id.trim()
      ? body.sede_id.trim()
      : companyAccess.defaultSiteId;
    const contextError = validateOrderCompanyContext(companyAccess, {
      companyId: requestedCompanyId,
      siteId: requestedSiteId,
      usesSites: empresa.usa_sedes,
    });
    if (contextError) {
      const isSiteRequired = contextError === 'SITE_REQUIRED';
      return NextResponse.json(
        {
          error: isSiteRequired ? 'SEDE_REQUIRED' : 'FORBIDDEN',
          details: isSiteRequired
            ? 'Selecciona una sede autorizada para esta empresa.'
            : 'No tienes el rol o acceso requerido para crear el pedido.',
        },
        { status: isSiteRequired ? 422 : 403 }
      );
    }

    let sedeId: string | null = null;
    let sedeData: { id: string; nombre_sede: string; direccion: string | null; ciudad: string | null; odoo_address_id: number | null } | null = null;
    if (requestedSiteId) {
      const { data: sede, error: sedeError } = await admin
        .from('sedes')
        .select('id, nombre_sede, direccion, ciudad, odoo_address_id')
        .eq('id', requestedSiteId)
        .eq('empresa_id', requestedCompanyId)
        .eq('activa', true)
        .maybeSingle();

      if (sedeError || !sede) {
        return NextResponse.json(
          { error: 'INVALID_SEDE', details: sedeError?.message ?? 'La sede seleccionada no es válida para la empresa.' },
          { status: 422 }
        );
      }

      sedeId = requestedSiteId;
      sedeData = sede;
    }

    const esBorrador = Boolean(body.guardar_como_borrador);

    // Recalcular precios de catálogo server-side con jerarquía: override > costo+margen > pricelist
    const catalogItemsToReprice = items.filter((i) => i.tipo_item === 'catalogo' && i.odoo_product_id);
    let modoPricing: ModoPricing = 'costo_margen';
    if (!esBorrador && catalogItemsToReprice.length > 0) {
      try {
        const pricingCtx = await loadPricingContext(requestedCompanyId);
        modoPricing = pricingCtx.modoPricing;
        const odooConfig = await getServerOdooConfig();
        if (odooConfig) {
          const odooSession = await authenticate(odooConfig);

          // En modo tarifa el precio autoritativo es el de la tarifa del cliente
          // en Odoo, resuelto POR VARIANTE. Sin esto el precio se validaba
          // contra el list_price crudo del template, que en este catálogo suele
          // ser 0 (y a veces 1), y dos variantes de un mismo producto con
          // precios negociados distintos terminaban cobrándose igual.
          const pricelistRules = pricingCtx.modoPricing === 'pricelist'
            ? await loadEmpresaPricelistRules(requestedCompanyId, odooSession)
            : null;

          const templateIds = [...new Set(catalogItemsToReprice.map((i) => i.odoo_product_id!))];
          const templates = await read(
            'product.template',
            templateIds,
            ['id', 'list_price', 'standard_price', 'categ_id'],
            odooSession
          );
          const templateMap = new Map(templates.map((t) => [Number(t.id), t]));

          // Para variantes, obtener su standard_price y lst_price individual
          const variantIds = catalogItemsToReprice
            .filter((i) => i.odoo_variant_id)
            .map((i) => i.odoo_variant_id!);
          const variantMap = new Map<number, { standard_price: number; lst_price: number }>();
          if (variantIds.length > 0) {
            const variants = await read(
              'product.product',
              [...new Set(variantIds)],
              ['id', 'standard_price', 'lst_price'],
              odooSession
            );
            for (const v of variants) {
              variantMap.set(Number(v.id), {
                standard_price: Number(v.standard_price ?? 0),
                lst_price: Number(v.lst_price ?? 0),
              });
            }
          }

          for (const item of items) {
            if (item.tipo_item !== 'catalogo' || !item.odoo_product_id) continue;
            const tmpl = templateMap.get(item.odoo_product_id);
            if (!tmpl) continue;

            const variantData = item.odoo_variant_id ? variantMap.get(item.odoo_variant_id) : null;
            const categId = Array.isArray(tmpl.categ_id) ? Number(tmpl.categ_id[0]) : null;
            let basePrice = variantData?.lst_price ?? Number(tmpl.list_price ?? 0);

            if (pricelistRules) {
              const tarifaPrice = resolvePricelistPrice(pricelistRules, {
                templateId: item.odoo_product_id,
                variantId: item.odoo_variant_id ?? null,
                categId,
                basePrice,
                quantity: item.cantidad,
              });

              // Si la tarifa no da un precio que podamos calcular con fidelidad,
              // no lo inventamos: conservamos el precio con el que se armó el
              // carrito en vez de pisarlo con un list_price que no es de venta.
              if (tarifaPrice === null) continue;
              basePrice = tarifaPrice;
            }

            const resolvedPrice = resolveProductPrice(pricingCtx, {
              id: item.odoo_product_id,
              list_price: basePrice,
              standard_price: variantData?.standard_price ?? Number(tmpl.standard_price ?? 0),
              categ_id: Array.isArray(tmpl.categ_id) ? tmpl.categ_id as [number, string] : false,
            });

            if (resolvedPrice > 0) {
              item.precio_unitario_cop = resolvedPrice;
            }
          }
        }
      } catch (repriceError) {
        console.warn('[Pedido] Error recalculando precios server-side, usando precios del frontend:', repriceError);
      }
    }

    const totalItems = items.reduce((sum, item) => sum + item.cantidad, 0);
    const valorTotal = items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario_cop, 0);

    const estadoInicial = esBorrador ? 'borrador' : undefined; // undefined = trigger de BD decide

    const insertData: Record<string, unknown> = {
      empresa_id: requestedCompanyId,
      sede_id: sedeId,
      usuario_creador_id: perfil.id,
      idempotency_key: idempotencyKey,
      comentarios_sede: body.comentarios_sede?.trim() || null,
      valor_total_cop: valorTotal,
      total_items: totalItems,
    };
    if (estadoInicial) insertData.estado = estadoInicial;

    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .insert(insertData)
      .select('id, numero, estado, fecha_aprobacion')
      .single();

    if (pedidoError && idempotencyKey && pedidoError.code === '23505') {
      const { data: existingPedido } = await admin
        .from('pedidos')
        .select('id, numero, estado, fecha_aprobacion, odoo_sale_order_id')
        .eq('usuario_creador_id', perfil.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingPedido) {
        return NextResponse.json({
          ok: true,
          idempotent_replay: true,
          pedido: existingPedido,
          warning: null,
        });
      }
    }

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

    // Borradores: solo log básico y retorno inmediato
    if (esBorrador) {
      await admin.from('logs_trazabilidad').insert({
        pedido_id: pedido.id,
        accion: 'creacion',
        descripcion: `Pedido guardado como borrador con ${totalItems} items`,
        usuario_id: perfil.id,
        usuario_nombre: nombreUsuario,
        metadata: { total_items: totalItems, valor_total_cop: valorTotal, borrador: true },
      });

      return NextResponse.json({
        ok: true,
        pedido: {
          id: pedido.id,
          numero: pedido.numero,
          estado: 'borrador',
          fecha_aprobacion: null,
          odoo_sale_order_id: null,
        },
        warning: null,
      });
    }

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
            enforceLinePrices: modoPricing === 'costo_margen',
            lines: catalogItems.map((item) => ({
              productTemplateId: Number(item.odoo_product_id),
              productId: item.odoo_variant_id ? Number(item.odoo_variant_id) : undefined,
              quantity: Number(item.cantidad),
              priceUnit: Number(item.precio_unitario_cop),
            })),
          });

          const { error: syncUpdateError } = await admin
            .from('pedidos')
            .update({
              estado: 'procesado_odoo',
              odoo_sale_order_id: quotation.id,
              odoo_sync_status: 'completado',
              odoo_sync_started_at: new Date().toISOString(),
              odoo_sync_error: null,
            })
            .eq('id', pedido.id);

          if (syncUpdateError) {
            throw new Error(`La cotización ${quotation.name || quotation.id} se creó, pero no se pudo vincular al pedido: ${syncUpdateError.message}`);
          }

          odooSyncResult.odoo_sale_order_id = quotation.id;

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

    if (!flujoEsAprobacion && empresa.odoo_partner_id && !odooSyncResult.odoo_sale_order_id && odooSyncResult.odoo_warning) {
      await admin
        .from('pedidos')
        .update({
          odoo_sync_status: 'error',
          odoo_sync_error: odooSyncResult.odoo_warning,
        })
        .eq('id', pedido.id);
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
