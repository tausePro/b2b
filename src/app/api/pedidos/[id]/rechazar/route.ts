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
    if (!['aprobador', 'super_admin', 'direccion'].includes(perfil.rol)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Tu rol no puede rechazar pedidos.' },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: pedido, error: pedidoError } = await admin
      .from('pedidos')
      .select('id, numero, estado, empresa_id')
      .eq('id', pedidoId)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: 'PEDIDO_NOT_FOUND', details: pedidoError?.message ?? null },
        { status: 404 }
      );
    }

    if (perfil.rol === 'aprobador' && perfil.empresa_id !== pedido.empresa_id) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'No tienes acceso a este pedido.' },
        { status: 403 }
      );
    }

    if (pedido.estado !== 'en_aprobacion') {
      return NextResponse.json(
        {
          error: 'INVALID_STATE',
          details: `El pedido ${pedido.numero} está en estado ${pedido.estado} y no se puede rechazar.`,
        },
        { status: 409 }
      );
    }

    let motivo: string | null = null;
    try {
      const body = await request.json();
      motivo = body.motivo ?? null;
    } catch {
      // body vacío es válido
    }

    const { error: updateError } = await admin
      .from('pedidos')
      .update({
        estado: 'rechazado',
        comentarios_aprobador: motivo,
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

    const descripcion = motivo
      ? `Pedido rechazado por ${nombreUsuario}. Motivo: ${motivo}`
      : `Pedido rechazado por ${nombreUsuario}.`;

    const { error: logError } = await admin.from('logs_trazabilidad').insert({
      pedido_id: pedidoId,
      accion: 'rechazo',
      descripcion,
      usuario_id: perfil.id,
      usuario_nombre: nombreUsuario,
      metadata: motivo ? { motivo } : null,
    });

    const notificationResult = await safeEnqueuePedidoNotifications({
      actorUserId: perfil.id,
      event: 'pedido_rechazado',
      pedidoId,
    });
    const warning = [logError?.message, notificationResult.error].filter(Boolean).join(' | ') || null;

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedidoId,
        estado: 'rechazado',
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
