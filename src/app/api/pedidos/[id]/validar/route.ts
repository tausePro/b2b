import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { safeEnqueuePedidoNotifications } from '@/lib/notifications/pedidos';
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
    if (!['asesor', 'super_admin', 'direccion'].includes(perfil.rol)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Tu rol no puede validar pedidos.' },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .select('id, numero, estado, empresa_id, odoo_sale_order_id')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: 'PEDIDO_NOT_FOUND', details: pedidoError?.message ?? null },
        { status: 404 }
      );
    }

    // Asesor solo puede validar pedidos de empresas asignadas
    if (perfil.rol === 'asesor') {
      const { count } = await admin
        .from('asesor_empresas')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', perfil.id)
        .eq('empresa_id', pedido.empresa_id)
        .eq('activo', true);

      if (!count || count === 0) {
        return NextResponse.json(
          { error: 'FORBIDDEN', details: 'No tienes acceso a esta empresa.' },
          { status: 403 }
        );
      }
    }

    if (pedido.estado !== 'aprobado') {
      return NextResponse.json(
        {
          error: 'INVALID_STATE',
          details: `El pedido ${pedido.numero} está en estado ${pedido.estado} y no se puede validar. Solo pedidos aprobados pueden validarse.`,
        },
        { status: 409 }
      );
    }

    if (pedido.odoo_sale_order_id) {
      return NextResponse.json(
        {
          error: 'ALREADY_SYNCED',
          details: `El pedido ${pedido.numero} ya fue sincronizado con Odoo.`,
        },
        { status: 409 }
      );
    }

    const validationTimestamp = new Date().toISOString();
    const { error: updateError } = await admin
      .from('pedidos')
      .update({
        estado: 'en_validacion_imprima',
        validado_por: perfil.id,
        fecha_validacion: validationTimestamp,
      })
      .eq('id', pedidoId);

    if (updateError) {
      return NextResponse.json(
        { error: 'PEDIDO_UPDATE_ERROR', details: updateError.message },
        { status: 500 }
      );
    }

    const nombreUsuario = [perfil.nombre, perfil.apellido]
      .filter(Boolean)
      .join(' ')
      .trim() || user.email || 'Usuario';

    const { error: logError } = await admin.from('logs_trazabilidad').insert({
      pedido_id: pedidoId,
      accion: 'validacion',
      descripcion: `Pedido en validación por asesor comercial Imprima (${nombreUsuario}).`,
      usuario_id: perfil.id,
      usuario_nombre: nombreUsuario,
    });

    const notificationResult = await safeEnqueuePedidoNotifications({
      actorUserId: perfil.id,
      event: 'pedido_validado',
      pedidoId,
    });
    const warning = [logError?.message, notificationResult.error].filter(Boolean).join(' | ') || null;

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedidoId,
        estado: 'en_validacion_imprima',
        fecha_validacion: validationTimestamp,
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
