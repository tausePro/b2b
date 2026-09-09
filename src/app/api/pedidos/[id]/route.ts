import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizeTipoPedidoItem, partitionPedidoItems } from '@/lib/pedidoItems';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { TipoPedidoItem } from '@/types';
import { getClientCompanyAccess } from '@/lib/auth/companyMemberships.server';
import { safeEnqueuePedidoNotifications } from '@/lib/notifications/pedidos';
import {
  PEDIDO_ITEM_APROBACION_FIELDS,
  computePedidoTotals,
  repriceCatalogItems,
  resolveEstadoAlEnviarBorrador,
  sincronizarPedidoAprobadoConOdoo,
  type PedidoItemAprobacion,
} from '@/lib/pedidos/aprobacion.server';

type PerfilActual = {
  id: string;
  rol: string;
  empresa_id: string | null;
  nombre: string | null;
  apellido: string | null;
};

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── DELETE: Eliminar pedido (solo super_admin) ───

export async function DELETE(
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
    if (!['super_admin', 'comprador', 'aprobador'].includes(perfil.rol)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'No tienes permisos para eliminar pedidos.' },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .select('id, numero, estado, empresa_id, sede_id, usuario_creador_id')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: 'PEDIDO_NOT_FOUND', details: pedidoError?.message ?? null },
        { status: 404 }
      );
    }

    // Comprador solo puede eliminar sus propios borradores
    if (perfil.rol !== 'super_admin') {
      const companyAccess = await getClientCompanyAccess(admin, perfil.id, pedido.empresa_id);
      if (companyAccess?.role !== 'comprador') {
        return NextResponse.json(
          { error: 'FORBIDDEN', details: 'No tienes rol comprador en la empresa de este pedido.' },
          { status: 403 }
        );
      }
      if (pedido.sede_id && !companyAccess.siteIds.includes(pedido.sede_id)) {
        return NextResponse.json(
          { error: 'FORBIDDEN', details: 'No tienes acceso a la sede de este pedido.' },
          { status: 403 }
        );
      }
      if (pedido.estado !== 'borrador') {
        return NextResponse.json(
          { error: 'FORBIDDEN', details: 'Solo puedes eliminar pedidos en estado borrador.' },
          { status: 403 }
        );
      }
      if (pedido.usuario_creador_id !== perfil.id) {
        return NextResponse.json(
          { error: 'FORBIDDEN', details: 'Solo puedes eliminar tus propios borradores.' },
          { status: 403 }
        );
      }
    }

    // pedido_items, logs_trazabilidad se eliminan por ON DELETE CASCADE
    const { error: deleteError } = await admin
      .from('pedidos')
      .delete()
      .eq('id', pedidoId);

    if (deleteError) {
      return NextResponse.json(
        { error: 'DELETE_ERROR', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: {
        id: pedidoId,
        numero: pedido.numero,
      },
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

// ─── PATCH: Editar items de pedido (aprobador, solo en_aprobacion) ───

type PatchItemInput = {
  id: string;
  cantidad?: number;
  eliminar?: boolean;
};

type NewItemInput = {
  tipo_item: TipoPedidoItem;
  odoo_product_id: number | null;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
  unidad?: string | null;
  referencia_cliente?: string | null;
  comentarios_item?: string | null;
};

type PatchPedidoRequest = {
  items?: PatchItemInput[];
  newItems?: NewItemInput[];
  comentarios_aprobador?: string | null;
  estado?: string;
};

function normalizeNewItemInput(item: Partial<NewItemInput>): NewItemInput {
  const tipo_item = normalizeTipoPedidoItem(item.tipo_item);
  const rawOdooProductId = item.odoo_product_id;
  const odoo_product_id = tipo_item === 'catalogo' && rawOdooProductId !== null && rawOdooProductId !== undefined
    ? Number(rawOdooProductId)
    : null;

  return {
    tipo_item,
    odoo_product_id,
    nombre_producto: typeof item.nombre_producto === 'string' ? item.nombre_producto.trim() : '',
    cantidad: Number(item.cantidad),
    precio_unitario_cop: Number(item.precio_unitario_cop ?? 0),
    unidad: typeof item.unidad === 'string' ? item.unidad.trim() || null : null,
    referencia_cliente: typeof item.referencia_cliente === 'string' ? item.referencia_cliente.trim() || null : null,
    comentarios_item: typeof item.comentarios_item === 'string' ? item.comentarios_item.trim() || null : null,
  };
}

function isValidNewItem(item: NewItemInput) {
  if (item.tipo_item === 'especial') {
    return (
      Number.isFinite(item.cantidad) &&
      Number.isFinite(item.precio_unitario_cop) &&
      item.odoo_product_id === null &&
      item.cantidad > 0 &&
      item.precio_unitario_cop >= 0 &&
      Boolean(item.nombre_producto.trim())
    );
  }

  return (
    Number.isFinite(item.odoo_product_id) &&
    Number.isFinite(item.cantidad) &&
    Number.isFinite(item.precio_unitario_cop) &&
    (item.odoo_product_id ?? 0) > 0 &&
    item.cantidad > 0 &&
    item.precio_unitario_cop >= 0 &&
    Boolean(item.nombre_producto.trim())
  );
}

export async function PATCH(
  request: NextRequest,
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
    if (!['aprobador', 'super_admin', 'comprador'].includes(perfil.rol)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Tu rol no puede editar pedidos.' },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .select('id, numero, estado, empresa_id, sede_id, usuario_creador_id')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: 'PEDIDO_NOT_FOUND', details: pedidoError?.message ?? null },
        { status: 404 }
      );
    }

    const companyAccess = perfil.rol === 'super_admin'
      ? null
      : await getClientCompanyAccess(admin, perfil.id, pedido.empresa_id);
    const effectiveRole = perfil.rol === 'super_admin' ? 'super_admin' : companyAccess?.role ?? null;
    if (!effectiveRole) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'No tienes acceso a este pedido.' },
        { status: 403 }
      );
    }
    if (companyAccess && pedido.sede_id && !companyAccess.siteIds.includes(pedido.sede_id)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'No tienes acceso a la sede de este pedido.' },
        { status: 403 }
      );
    }

    // Comprador solo puede editar/enviar sus propios borradores
    if (effectiveRole === 'comprador' && (pedido.estado !== 'borrador' || pedido.usuario_creador_id !== perfil.id)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Solo puedes editar tus propios borradores.' },
        { status: 403 }
      );
    }

    if (!['en_aprobacion', 'borrador'].includes(pedido.estado)) {
      return NextResponse.json(
        {
          error: 'INVALID_STATE',
          details: `El pedido ${pedido.numero} está en estado "${pedido.estado}". Solo se pueden editar pedidos en borrador o pendientes de aprobación.`,
        },
        { status: 409 }
      );
    }

    const body = (await request.json()) as PatchPedidoRequest;

    // Envío de un borrador al flujo. El trigger set_estado_pedido_inicial solo
    // corre en INSERT, así que aquí hay que replicar su decisión: si la empresa
    // no requiere aprobación, el pedido se aprueba de inmediato y se crea la
    // cotización en Odoo, igual que un pedido enviado desde el carrito.
    if (body.estado === 'en_aprobacion' && pedido.estado === 'borrador') {
      const nombreUsuario = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || user.email || 'Usuario';

      const { data: empresa, error: empresaError } = await admin
        .from('empresas')
        .select('id, requiere_aprobacion, odoo_partner_id')
        .eq('id', pedido.empresa_id)
        .single();

      if (empresaError || !empresa) {
        return NextResponse.json(
          { error: 'COMPANY_NOT_FOUND', details: empresaError?.message ?? null },
          { status: 404 }
        );
      }

      const { data: itemsData, error: itemsError } = await admin
        .from('pedido_items')
        .select(PEDIDO_ITEM_APROBACION_FIELDS)
        .eq('pedido_id', pedidoId)
        .order('created_at');

      if (itemsError) {
        return NextResponse.json(
          { error: 'ITEMS_FETCH_ERROR', details: itemsError.message },
          { status: 500 }
        );
      }

      const items = (itemsData || []) as PedidoItemAprobacion[];
      if (items.length === 0) {
        return NextResponse.json(
          { error: 'EMPTY_ORDER', details: 'El borrador no tiene ítems. Agrega productos antes de enviarlo.' },
          { status: 422 }
        );
      }

      const estadoDestino = resolveEstadoAlEnviarBorrador(empresa.requiere_aprobacion);

      if (estadoDestino === 'en_aprobacion') {
        const { error: updateError } = await admin
          .from('pedidos')
          .update({ estado: 'en_aprobacion' })
          .eq('id', pedidoId);

        if (updateError) {
          return NextResponse.json(
            { error: 'UPDATE_ERROR', details: updateError.message },
            { status: 500 }
          );
        }

        await admin.from('logs_trazabilidad').insert({
          pedido_id: pedidoId,
          accion: 'creacion',
          descripcion: `Borrador enviado a aprobación`,
          usuario_id: perfil.id,
          usuario_nombre: nombreUsuario,
        });

        const notificationResult = await safeEnqueuePedidoNotifications({
          actorUserId: perfil.id,
          event: 'pedido_creado_en_aprobacion',
          pedidoId,
        });

        return NextResponse.json({
          ok: true,
          pedido: { ...pedido, estado: 'en_aprobacion' },
          notifications: notificationResult.result,
          warning: notificationResult.error,
        });
      }

      // Empresa sin aprobación: reprecificar con la jerarquía autoritativa antes
      // de aprobar, para que el presupuesto y la cotización usen precios vigentes.
      const { catalogItems } = partitionPedidoItems(items);
      const modoPricing = await repriceCatalogItems(admin, pedido.empresa_id, catalogItems);
      const fechaAprobacion = new Date().toISOString();

      const { error: approveError } = await admin
        .from('pedidos')
        .update({
          estado: 'aprobado',
          fecha_aprobacion: fechaAprobacion,
          ...computePedidoTotals(items),
        })
        .eq('id', pedidoId);

      if (approveError) {
        return NextResponse.json(
          { error: 'UPDATE_ERROR', details: approveError.message },
          { status: 500 }
        );
      }

      const { error: logError } = await admin.from('logs_trazabilidad').insert({
        pedido_id: pedidoId,
        accion: 'creacion',
        descripcion: `Borrador enviado con aprobación automática (la empresa no requiere aprobación)`,
        usuario_id: perfil.id,
        usuario_nombre: nombreUsuario,
        metadata: { requiere_aprobacion: false, auto_aprobado: true, ...computePedidoTotals(items) },
      });

      const notificationResult = await safeEnqueuePedidoNotifications({
        actorUserId: perfil.id,
        event: 'pedido_creado_autoaprobado',
        pedidoId,
      });

      const warnings = [logError?.message, notificationResult.error];
      let estadoFinal: string = 'aprobado';
      let odooSaleOrderId: number | null = null;

      if (!empresa.odoo_partner_id) {
        warnings.push('La empresa no tiene odoo_partner_id; el pedido quedó aprobado sin cotización en Odoo.');
      } else {
        const sync = await sincronizarPedidoAprobadoConOdoo(admin, {
          pedidoId,
          actor: { id: perfil.id, nombre: nombreUsuario },
          autoAprobado: true,
          modoPricing,
        });

        if (sync.ok) {
          estadoFinal = sync.estado;
          odooSaleOrderId = sync.odooSaleOrderId;
          if (!sync.alreadySynced) warnings.push(sync.warning);
        } else {
          warnings.push(sync.details ?? sync.error);
          console.error('[Pedido borrador auto-aprobado] Error Odoo:', sync.error, sync.details);
        }
      }

      return NextResponse.json({
        ok: true,
        pedido: {
          ...pedido,
          estado: estadoFinal,
          fecha_aprobacion: fechaAprobacion,
          odoo_sale_order_id: odooSaleOrderId,
        },
        notifications: notificationResult.result,
        warning: warnings.filter(Boolean).join(' | ') || null,
      });
    }

    const itemChanges = Array.isArray(body.items) ? body.items : [];
    const normalizedNewItems = Array.isArray(body.newItems)
      ? body.newItems.map((item) => normalizeNewItemInput(item))
      : [];
    const newItems = normalizedNewItems.filter(isValidNewItem);

    if (Array.isArray(body.newItems) && normalizedNewItems.length !== newItems.length) {
      return NextResponse.json(
        { error: 'INVALID_NEW_ITEMS', details: 'Uno o más items nuevos son inválidos.' },
        { status: 422 }
      );
    }

    if (itemChanges.length === 0 && newItems.length === 0 && body.comentarios_aprobador === undefined) {
      return NextResponse.json(
        { error: 'EMPTY_PATCH', details: 'No se proporcionaron cambios.' },
        { status: 422 }
      );
    }

    const itemsToDelete = itemChanges.filter((i) => i.eliminar === true).map((i) => i.id);
    const itemsToUpdate = itemChanges.filter(
      (i) => !i.eliminar && i.cantidad !== undefined && Number.isFinite(i.cantidad) && i.cantidad > 0
    );

    // Eliminar items marcados
    if (itemsToDelete.length > 0) {
      const { error: delError } = await admin
        .from('pedido_items')
        .delete()
        .in('id', itemsToDelete)
        .eq('pedido_id', pedidoId);

      if (delError) {
        return NextResponse.json(
          { error: 'ITEM_DELETE_ERROR', details: delError.message },
          { status: 500 }
        );
      }
    }

    // Actualizar cantidades
    for (const item of itemsToUpdate) {
      const { error: updError } = await admin
        .from('pedido_items')
        .update({ cantidad: item.cantidad })
        .eq('id', item.id)
        .eq('pedido_id', pedidoId);

      if (updError) {
        return NextResponse.json(
          { error: 'ITEM_UPDATE_ERROR', details: updError.message },
          { status: 500 }
        );
      }
    }

    // Insertar nuevos items
    if (newItems.length > 0) {
      const insertPayload = newItems.map((ni) => ({
        pedido_id: pedidoId,
        tipo_item: ni.tipo_item,
        odoo_product_id: ni.odoo_product_id,
        nombre_producto: ni.nombre_producto,
        cantidad: ni.cantidad,
        precio_unitario_cop: ni.precio_unitario_cop,
        unidad: ni.unidad,
        referencia_cliente: ni.referencia_cliente,
        comentarios_item: ni.comentarios_item,
      }));

      const { error: insertError } = await admin
        .from('pedido_items')
        .insert(insertPayload);

      if (insertError) {
        return NextResponse.json(
          { error: 'ITEM_INSERT_ERROR', details: insertError.message },
          { status: 500 }
        );
      }
    }

    // Recalcular totales del pedido
    const { data: remainingItems, error: itemsError } = await admin
      .from('pedido_items')
      .select('cantidad, precio_unitario_cop')
      .eq('pedido_id', pedidoId);

    if (itemsError) {
      return NextResponse.json(
        { error: 'ITEMS_FETCH_ERROR', details: itemsError.message },
        { status: 500 }
      );
    }

    if (!remainingItems || remainingItems.length === 0) {
      return NextResponse.json(
        { error: 'EMPTY_ORDER', details: 'No se pueden eliminar todos los items. El pedido debe tener al menos un ítem.' },
        { status: 422 }
      );
    }

    const newTotalItems = remainingItems.reduce((s, i) => s + (i.cantidad ?? 0), 0);
    const newValorTotal = remainingItems.reduce(
      (s, i) => s + (i.cantidad ?? 0) * (i.precio_unitario_cop ?? 0),
      0
    );

    const updatePayload: Record<string, unknown> = {
      total_items: newTotalItems,
      valor_total_cop: newValorTotal,
    };

    if (body.comentarios_aprobador !== undefined) {
      updatePayload.comentarios_aprobador = body.comentarios_aprobador?.trim() || null;
    }

    const { error: pedidoUpdateError } = await admin
      .from('pedidos')
      .update(updatePayload)
      .eq('id', pedidoId);

    if (pedidoUpdateError) {
      return NextResponse.json(
        { error: 'PEDIDO_UPDATE_ERROR', details: pedidoUpdateError.message },
        { status: 500 }
      );
    }

    // Log de trazabilidad
    const nombreUsuario = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || user.email || 'Usuario';
    const cambios: string[] = [];
    if (newItems.length > 0) cambios.push(`${newItems.length} item(s) agregado(s)`);
    if (itemsToDelete.length > 0) cambios.push(`${itemsToDelete.length} item(s) eliminado(s)`);
    if (itemsToUpdate.length > 0) cambios.push(`${itemsToUpdate.length} item(s) modificado(s)`);
    if (body.comentarios_aprobador !== undefined) cambios.push('comentarios actualizados');

    await admin.from('logs_trazabilidad').insert({
      pedido_id: pedidoId,
      accion: 'edicion',
      descripcion: `Pedido editado por ${nombreUsuario}: ${cambios.join(', ')}.`,
      usuario_id: perfil.id,
      usuario_nombre: nombreUsuario,
      metadata: {
        items_eliminados: itemsToDelete.length,
        items_modificados: itemsToUpdate.length,
        nuevo_total_items: newTotalItems,
        nuevo_valor_total: newValorTotal,
      },
    });

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedidoId,
        numero: pedido.numero,
        total_items: newTotalItems,
        valor_total_cop: newValorTotal,
      },
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
