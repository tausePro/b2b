import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getClientCompanyAccess } from '@/lib/auth/companyMemberships.server';
import { sincronizarPedidoAprobadoConOdoo } from '@/lib/pedidos/aprobacion.server';

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

type PedidoAcceso = {
  id: string;
  numero: string;
  estado: string;
  empresa_id: string;
  sede_id: string | null;
};

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: pedidoId } = await context.params;

  try {
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
    if (!['comprador', 'aprobador', 'super_admin', 'direccion'].includes(perfil.rol)) {
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
      .select('id, numero, estado, empresa_id, sede_id')
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

    const pedido = pedidoData as PedidoAcceso;

    const isInternalApprover = perfil.rol === 'super_admin' || perfil.rol === 'direccion';
    const companyAccess = isInternalApprover
      ? null
      : await getClientCompanyAccess(admin, perfil.id, pedido.empresa_id);
    if (!isInternalApprover && companyAccess?.role !== 'aprobador') {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'No tienes rol aprobador en la empresa de este pedido.',
        },
        { status: 403 }
      );
    }
    if (!isInternalApprover && pedido.sede_id && !companyAccess?.siteIds.includes(pedido.sede_id)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'No tienes acceso a la sede de este pedido.' },
        { status: 403 }
      );
    }

    const result = await sincronizarPedidoAprobadoConOdoo(admin, {
      pedidoId,
      actor: {
        id: perfil.id,
        nombre: [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || user.email || 'Usuario',
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          details: result.details,
          ...(result.odooSaleOrderId ? { odoo_sale_order_id: result.odooSaleOrderId } : {}),
        },
        { status: result.status }
      );
    }

    if (result.alreadySynced) {
      return NextResponse.json({
        ok: true,
        already_synced: true,
        pedido: {
          id: pedidoId,
          estado: result.estado,
          odoo_sale_order_id: result.odooSaleOrderId,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      pedido: {
        id: pedidoId,
        estado: result.estado,
        fecha_aprobacion: result.fechaAprobacion,
        odoo_sale_order_id: result.odooSaleOrderId,
      },
      odoo_sale_order: result.quotation,
      notifications: result.notifications,
      warning: result.warning,
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
