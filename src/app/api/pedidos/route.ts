import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { safeEnqueuePedidoNotifications } from '@/lib/notifications/pedidos';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type PerfilActual = {
  id: string;
  rol: string;
  empresa_id: string | null;
  sede_id: string | null;
  nombre: string | null;
  apellido: string | null;
};

type CreatePedidoItemInput = {
  odoo_product_id: number;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
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
  return (
    Number.isFinite(item.odoo_product_id) &&
    Number.isFinite(item.cantidad) &&
    Number.isFinite(item.precio_unitario_cop) &&
    item.odoo_product_id > 0 &&
    item.cantidad > 0 &&
    item.precio_unitario_cop >= 0 &&
    Boolean(item.nombre_producto?.trim())
  );
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
    const items = Array.isArray(body.items) ? body.items : [];

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
      .select('id, nombre, requiere_aprobacion, usa_sedes')
      .eq('id', perfil.empresa_id)
      .single();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { error: 'COMPANY_NOT_FOUND', details: empresaError?.message ?? null },
        { status: 404 }
      );
    }

    let sedeId: string | null = null;
    if (empresa.usa_sedes) {
      if (!perfil.sede_id) {
        return NextResponse.json(
          { error: 'SEDE_REQUIRED', details: 'Tu empresa opera con sedes y tu usuario no tiene una sede asignada.' },
          { status: 422 }
        );
      }

      const { data: sede, error: sedeError } = await admin
        .from('sedes')
        .select('id')
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
      nombre_producto: item.nombre_producto.trim(),
      cantidad: item.cantidad,
      precio_unitario_cop: item.precio_unitario_cop,
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

    const warning = [logError?.message, notificationResult.error].filter(Boolean).join(' | ') || null;

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedido.id,
        numero: pedido.numero,
        estado: pedido.estado,
        fecha_aprobacion: pedido.fecha_aprobacion,
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
