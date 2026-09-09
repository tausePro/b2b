import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authenticate,
  createSaleOrderQuotation,
  read,
  resolvePricelistPrice,
  type OdooSaleOrderResult,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { mergePedidoNoteWithSpecialItems, partitionPedidoItems } from '@/lib/pedidoItems';
import { safeEnqueuePedidoNotifications } from '@/lib/notifications/pedidos';
import { loadPricingContext, resolveProductPrice, type ModoPricing } from '@/lib/pricing/margins';
import { loadEmpresaPricelistRules } from '@/lib/pricing/pricelist';
import type { TipoPedidoItem } from '@/types';

/**
 * Lógica compartida de aprobación de pedidos: reprecio autoritativo de los
 * ítems y creación de la cotización en Odoo. La usan la aprobación manual
 * (`POST /api/pedidos/[id]/aprobar`) y el envío de borradores de empresas sin
 * aprobación (`PATCH /api/pedidos/[id]`), para que ambos caminos produzcan el
 * mismo resultado que un pedido creado desde el carrito.
 */

export type AprobacionActor = {
  id: string;
  nombre: string;
};

export type PedidoEmpresaAprobacion = {
  id: string;
  nombre: string;
  odoo_partner_id: number | null;
  odoo_comercial_id: number | null;
};

export type PedidoSedeAprobacion = {
  id: string;
  nombre_sede: string;
  direccion: string | null;
  ciudad: string | null;
  odoo_address_id: number | null;
};

export type PedidoDetalleAprobacion = {
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
  empresa: PedidoEmpresaAprobacion | null;
  sede: PedidoSedeAprobacion | null;
};

export type PedidoItemAprobacion = {
  id: string;
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

export const PEDIDO_ITEM_APROBACION_FIELDS =
  'id, tipo_item, odoo_product_id, odoo_variant_id, nombre_producto, cantidad, precio_unitario_cop, unidad, referencia_cliente, comentarios_item';

export type SincronizacionOdooResult =
  | { ok: true; alreadySynced: true; estado: string; odooSaleOrderId: number }
  | {
      ok: true;
      alreadySynced: false;
      estado: 'procesado_odoo';
      fechaAprobacion: string;
      odooSaleOrderId: number;
      quotation: OdooSaleOrderResult;
      notifications: unknown;
      warning: string | null;
    }
  | { ok: false; status: number; error: string; details: string | null; odooSaleOrderId?: number };

export function buildQuotationNote(
  pedido: Pick<PedidoDetalleAprobacion, 'numero' | 'sede' | 'comentarios_sede' | 'comentarios_aprobador'>,
): string | null {
  const comentariosSede = pedido.comentarios_sede?.trim();
  const comentariosAprobador = pedido.comentarios_aprobador?.trim();
  const lines = [
    `Pedido B2B ${pedido.numero}`,
    pedido.sede?.nombre_sede ? `Sede: ${pedido.sede.nombre_sede}` : null,
    pedido.sede?.direccion ? `Dirección: ${pedido.sede.direccion}` : null,
    pedido.sede?.ciudad ? `Ciudad: ${pedido.sede.ciudad}` : null,
    comentariosSede ? `Comentarios sede: ${comentariosSede}` : null,
    comentariosAprobador ? `Comentarios aprobación: ${comentariosAprobador}` : null,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return lines.length > 0 ? lines.join('\n') : null;
}

export function computePedidoTotals(items: Array<Pick<PedidoItemAprobacion, 'cantidad' | 'precio_unitario_cop'>>) {
  return {
    total_items: items.reduce((sum, item) => sum + Number(item.cantidad ?? 0), 0),
    valor_total_cop: items.reduce((sum, item) => sum + Number(item.cantidad ?? 0) * Number(item.precio_unitario_cop ?? 0), 0),
  };
}

/**
 * Decide el estado con el que un borrador sale al flujo, replicando el trigger
 * `set_estado_pedido_inicial` que solo corre en INSERT: las empresas sin
 * aprobación quedan aprobadas de inmediato.
 */
export function resolveEstadoAlEnviarBorrador(requiereAprobacion: boolean | null | undefined) {
  return (requiereAprobacion ?? true) ? 'en_aprobacion' : 'aprobado';
}

/**
 * Recalcula server-side el precio de los ítems de catálogo con la jerarquía
 * override > costo+margen > pricelist, persiste los cambios en `pedido_items`
 * y devuelve el modo de pricing de la empresa. Ante cualquier error conserva
 * los precios existentes (misma tolerancia que el flujo de aprobación).
 */
export async function repriceCatalogItems(
  admin: SupabaseClient,
  empresaId: string,
  catalogItems: PedidoItemAprobacion[],
): Promise<ModoPricing> {
  let modoPricing: ModoPricing = 'costo_margen';
  if (catalogItems.length === 0) return modoPricing;

  try {
    const pricingCtx = await loadPricingContext(empresaId);
    modoPricing = pricingCtx.modoPricing;
    const odooConfig = await getServerOdooConfig();
    if (!odooConfig) return modoPricing;

    const session = await authenticate(odooConfig);

    // En modo tarifa el precio autoritativo es el de la tarifa del cliente en
    // Odoo, resuelto POR VARIANTE (ver comentario equivalente en POST /api/pedidos).
    const pricelistRules = pricingCtx.modoPricing === 'pricelist'
      ? await loadEmpresaPricelistRules(empresaId, session)
      : null;

    const templateIds = [...new Set(catalogItems.map((item) => Number(item.odoo_product_id)))];
    const templates = await read(
      'product.template',
      templateIds,
      ['id', 'list_price', 'standard_price', 'categ_id'],
      session,
    );
    const templateMap = new Map(templates.map((template) => [Number(template.id), template]));

    const variantIds = [...new Set(catalogItems.filter((item) => item.odoo_variant_id).map((item) => Number(item.odoo_variant_id)))];
    const variantMap = new Map<number, { standard_price: number; lst_price: number }>();
    if (variantIds.length > 0) {
      const variants = await read('product.product', variantIds, ['id', 'standard_price', 'lst_price'], session);
      for (const variant of variants) {
        variantMap.set(Number(variant.id), {
          standard_price: Number(variant.standard_price ?? 0),
          lst_price: Number(variant.lst_price ?? 0),
        });
      }
    }

    for (const item of catalogItems) {
      const template = templateMap.get(Number(item.odoo_product_id));
      if (!template) continue;
      const variantData = item.odoo_variant_id ? variantMap.get(Number(item.odoo_variant_id)) : null;
      const categId = Array.isArray(template.categ_id) ? Number(template.categ_id[0]) : null;
      let basePrice = variantData?.lst_price ?? Number(template.list_price ?? 0);

      if (pricelistRules) {
        const tarifaPrice = resolvePricelistPrice(pricelistRules, {
          templateId: Number(item.odoo_product_id),
          variantId: item.odoo_variant_id ? Number(item.odoo_variant_id) : null,
          categId,
          basePrice,
          quantity: Number(item.cantidad),
        });

        // Si la tarifa no da un precio que podamos calcular con fidelidad,
        // conservamos el precio existente en vez de pisarlo con un list_price
        // que no es de venta.
        if (tarifaPrice === null) continue;
        basePrice = tarifaPrice;
      }

      const resolvedPrice = resolveProductPrice(pricingCtx, {
        id: Number(item.odoo_product_id),
        list_price: basePrice,
        standard_price: variantData?.standard_price ?? Number(template.standard_price ?? 0),
        categ_id: Array.isArray(template.categ_id) ? template.categ_id as [number, string] : false,
      });

      if (resolvedPrice > 0 && Math.abs(resolvedPrice - Number(item.precio_unitario_cop)) > 0.009) {
        item.precio_unitario_cop = resolvedPrice;
        await admin.from('pedido_items').update({ precio_unitario_cop: resolvedPrice }).eq('id', item.id);
      }
    }
  } catch (repriceError) {
    console.warn('[Pedidos] Error recalculando precios, usando precios existentes:', repriceError);
  }

  return modoPricing;
}

async function marcarErrorSincronizacion(admin: SupabaseClient, pedidoId: string, details: string) {
  await admin
    .from('pedidos')
    .update({ odoo_sync_status: 'error', odoo_sync_error: details })
    .eq('id', pedidoId);
}

/**
 * Crea la cotización en Odoo para un pedido en estado `en_aprobacion` o
 * `aprobado` y lo deja en `procesado_odoo`. Reclama el pedido con
 * `claim_pedido_odoo_sync` para evitar cotizaciones duplicadas por
 * concurrencia y registra trazabilidad y notificaciones.
 */
export async function sincronizarPedidoAprobadoConOdoo(
  admin: SupabaseClient,
  params: {
    pedidoId: string;
    actor: AprobacionActor;
    /** true cuando la empresa no requiere aprobación: no se registra aprobador humano. */
    autoAprobado?: boolean;
    /** Si se provee, el llamador ya reprecificó los ítems en esta operación y se omite el reprecio. */
    modoPricing?: ModoPricing;
  },
): Promise<SincronizacionOdooResult> {
  const { pedidoId, actor, autoAprobado = false } = params;
  let odooSyncClaimed = false;

  try {
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
      return { ok: false, status: 404, error: 'PEDIDO_NOT_FOUND', details: pedidoError?.message ?? null };
    }

    const pedido = pedidoData as unknown as PedidoDetalleAprobacion;

    if (pedido.odoo_sale_order_id) {
      return { ok: true, alreadySynced: true, estado: pedido.estado, odooSaleOrderId: pedido.odoo_sale_order_id };
    }

    if (!['en_aprobacion', 'aprobado'].includes(pedido.estado)) {
      return {
        ok: false,
        status: 409,
        error: 'INVALID_STATE',
        details: `El pedido ${pedido.numero} está en estado ${pedido.estado} y no se puede aprobar.`,
      };
    }

    if (!pedido.empresa?.odoo_partner_id) {
      return {
        ok: false,
        status: 400,
        error: 'ODOO_PARTNER_MISSING',
        details: 'La empresa no tiene odoo_partner_id configurado.',
      };
    }

    const { data: itemsData, error: itemsError } = await admin
      .from('pedido_items')
      .select(PEDIDO_ITEM_APROBACION_FIELDS)
      .eq('pedido_id', pedidoId)
      .order('created_at');

    if (itemsError) {
      return { ok: false, status: 500, error: 'PEDIDO_ITEMS_ERROR', details: itemsError.message };
    }

    const items = (itemsData || []) as PedidoItemAprobacion[];
    if (items.length === 0) {
      return { ok: false, status: 400, error: 'PEDIDO_EMPTY', details: 'El pedido no tiene ítems para enviar a Odoo.' };
    }

    const { catalogItems, specialItems } = partitionPedidoItems(items);
    const invalidItems = catalogItems.filter((item) => {
      const templateId = Number(item.odoo_product_id);
      return !Number.isFinite(templateId) || templateId <= 0;
    });

    if (invalidItems.length > 0) {
      return {
        ok: false,
        status: 400,
        error: 'ODOO_PRODUCT_MISSING',
        details: `Hay ítems sin odoo_product_id válido: ${invalidItems.map((item) => item.nombre_producto).join(', ')}`,
      };
    }

    const { data: syncClaimed, error: syncClaimError } = await admin.rpc('claim_pedido_odoo_sync', {
      p_pedido_id: pedidoId,
    });

    if (syncClaimError) {
      return { ok: false, status: 500, error: 'ODOO_SYNC_CLAIM_ERROR', details: syncClaimError.message };
    }

    if (!syncClaimed) {
      const { data: currentPedido } = await admin
        .from('pedidos')
        .select('estado, odoo_sale_order_id, odoo_sync_status')
        .eq('id', pedidoId)
        .maybeSingle();

      if (currentPedido?.odoo_sale_order_id) {
        return {
          ok: true,
          alreadySynced: true,
          estado: String(currentPedido.estado),
          odooSaleOrderId: Number(currentPedido.odoo_sale_order_id),
        };
      }

      return {
        ok: false,
        status: 409,
        error: 'ODOO_SYNC_IN_PROGRESS',
        details: 'Este pedido ya está siendo sincronizado con Odoo. Espera unos segundos y actualiza la página.',
      };
    }

    odooSyncClaimed = true;

    const modoPricing = params.modoPricing
      ?? await repriceCatalogItems(admin, pedido.empresa_id ?? pedido.empresa.id, catalogItems);

    const odooConfig = await getServerOdooConfig();
    if (!odooConfig) {
      const details = 'No hay configuración de Odoo disponible en el servidor.';
      await marcarErrorSincronizacion(admin, pedidoId, details);
      odooSyncClaimed = false;
      return { ok: false, status: 500, error: 'ODOO_CONFIG_MISSING', details };
    }

    const session = await authenticate(odooConfig);
    const partnerRows = await read(
      'res.partner',
      [Number(pedido.empresa.odoo_partner_id)],
      ['id', 'property_product_pricelist'],
      session,
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
      clientReference: `${pedido.numero} (${pedido.id.slice(0, 8)})`,
      origin: pedido.numero,
      dateOrder: autoAprobado ? new Date().toISOString() : pedido.fecha_creacion,
      note: mergePedidoNoteWithSpecialItems(buildQuotationNote(pedido), specialItems),
      enforceLinePrices: modoPricing === 'costo_margen',
      lines: catalogItems.map((item) => ({
        productTemplateId: Number(item.odoo_product_id),
        productId: item.odoo_variant_id ? Number(item.odoo_variant_id) : undefined,
        quantity: Number(item.cantidad),
        priceUnit: Number(item.precio_unitario_cop),
      })),
    });

    const approvalTimestamp = pedido.fecha_aprobacion ?? new Date().toISOString();
    const { error: updateError } = await admin
      .from('pedidos')
      .update({
        estado: 'procesado_odoo',
        aprobado_por: autoAprobado ? pedido.aprobado_por : (pedido.aprobado_por ?? actor.id),
        fecha_aprobacion: approvalTimestamp,
        ...computePedidoTotals(items),
        odoo_sale_order_id: quotation.id,
        odoo_sync_status: 'completado',
        odoo_sync_error: null,
      })
      .eq('id', pedidoId);

    if (updateError) {
      await marcarErrorSincronizacion(
        admin,
        pedidoId,
        `La cotización ${quotation.name || quotation.id} se creó, pero no se pudo vincular: ${updateError.message}`,
      );
      odooSyncClaimed = false;
      return {
        ok: false,
        status: 500,
        error: 'PEDIDO_UPDATE_ERROR',
        details: updateError.message,
        odooSaleOrderId: quotation.id,
      };
    }

    odooSyncClaimed = false;

    const sujeto = autoAprobado ? 'Pedido auto-aprobado' : 'Pedido aprobado';
    const { error: logError } = await admin.from('logs_trazabilidad').insert({
      pedido_id: pedidoId,
      accion: 'aprobacion',
      descripcion: quotation.existing
        ? `${sujeto} y cotización existente detectada en Odoo (${quotation.name || quotation.id}).`
        : `${sujeto} y cotización creada en Odoo (${quotation.name || quotation.id}).`,
      usuario_id: actor.id,
      usuario_nombre: actor.nombre,
      metadata: {
        odoo_sale_order_id: quotation.id,
        odoo_sale_order_name: quotation.name,
        odoo_state: quotation.state,
        existing: quotation.existing,
        ...(autoAprobado ? { auto_aprobado: true } : {}),
      },
    });

    const notificationResult = await safeEnqueuePedidoNotifications({
      actorUserId: actor.id,
      event: 'pedido_procesado_odoo',
      pedidoId,
    });

    return {
      ok: true,
      alreadySynced: false,
      estado: 'procesado_odoo',
      fechaAprobacion: approvalTimestamp,
      odooSaleOrderId: quotation.id,
      quotation,
      notifications: notificationResult.result,
      warning: [logError?.message, notificationResult.error].filter(Boolean).join(' | ') || null,
    };
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    if (odooSyncClaimed) {
      await marcarErrorSincronizacion(admin, pedidoId, details);
    }
    return { ok: false, status: 500, error: 'INTERNAL_ERROR', details };
  }
}
