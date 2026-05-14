import { NextResponse, type NextRequest } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';

const LOGOS_BUCKET = 'logos-empresas';

/**
 * GET /api/admin/empresas/[id]
 * Devuelve un resumen de dependencias para previsualizar antes de eliminar.
 * Útil para que el modal de confirmación muestre cuántas sedes, configs,
 * usuarios y pedidos hay asociados.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
  if (authorized instanceof NextResponse) return authorized;

  const { admin } = authorized;
  const { id: empresaId } = await context.params;

  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('id, nombre, nit, odoo_partner_id, activa')
    .eq('id', empresaId)
    .maybeSingle();

  if (empresaError) {
    return NextResponse.json({ error: empresaError.message }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  const [
    pedidosCount,
    usuariosTotalCount,
    usuariosActivosCount,
    sedesCount,
    configsCount,
    asesoresCount,
    productosAutorizadosCount,
    margenesCount,
    overridesCount,
  ] = await Promise.all([
    admin.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin.from('usuarios').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin
      .from('usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('activo', true),
    admin.from('sedes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin.from('empresa_configs').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin
      .from('asesor_empresas')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    admin
      .from('productos_autorizados')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    admin.from('margenes_venta').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin
      .from('precios_empresa_producto')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
  ]);

  const pedidos = pedidosCount.count ?? 0;
  const usuariosTotal = usuariosTotalCount.count ?? 0;
  const usuariosActivos = usuariosActivosCount.count ?? 0;
  const usuariosInactivos = Math.max(usuariosTotal - usuariosActivos, 0);

  const puedeEliminar = pedidos === 0 && usuariosTotal === 0;
  const bloqueos: string[] = [];
  if (pedidos > 0) {
    bloqueos.push(
      `Tiene ${pedidos} pedido${pedidos === 1 ? '' : 's'} asociado${pedidos === 1 ? '' : 's'}. ` +
        'No se puede eliminar para preservar el historial.'
    );
  }
  if (usuariosActivos > 0) {
    bloqueos.push(
      `Tiene ${usuariosActivos} usuario${usuariosActivos === 1 ? '' : 's'} activo${usuariosActivos === 1 ? '' : 's'}. ` +
        'Desactívalos o elimínalos primero desde la sección de usuarios.'
    );
  }
  if (usuariosInactivos > 0) {
    bloqueos.push(
      `Tiene ${usuariosInactivos} usuario${usuariosInactivos === 1 ? '' : 's'} inactivo${usuariosInactivos === 1 ? '' : 's'} ` +
        'en la base. Bórralos manualmente antes de eliminar la empresa.'
    );
  }

  return NextResponse.json({
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      nit: empresa.nit,
      odoo_partner_id: empresa.odoo_partner_id,
      activa: empresa.activa,
    },
    dependencias: {
      pedidos,
      usuarios_total: usuariosTotal,
      usuarios_activos: usuariosActivos,
      usuarios_inactivos: usuariosInactivos,
      sedes: sedesCount.count ?? 0,
      configs: configsCount.count ?? 0,
      asesores: asesoresCount.count ?? 0,
      productos_autorizados: productosAutorizadosCount.count ?? 0,
      margenes: margenesCount.count ?? 0,
      overrides_precios: overridesCount.count ?? 0,
    },
    puede_eliminar: puedeEliminar,
    bloqueos,
  });
}

/**
 * DELETE /api/admin/empresas/[id]
 *
 * Elimina una empresa SOLO de la plataforma B2B. No toca Odoo.
 * El partner sigue existiendo en Odoo intacto.
 *
 * Body (JSON) opcional:
 *   - confirmacion_nombre: string  → debe coincidir (case-insensitive, trim)
 *     con el nombre actual de la empresa. Es una salvaguarda contra
 *     eliminaciones accidentales.
 *   - eliminar_logos: boolean (default false) → si true, también elimina
 *     los archivos del bucket `logos-empresas/<id>/` en Supabase Storage.
 *
 * Reglas:
 *   - Bloquea (409) si hay cualquier pedido asociado.
 *   - Bloquea (409) si hay cualquier usuario asociado (activo o no).
 *   - Bloquea (400) si confirmacion_nombre no coincide con el nombre real.
 *
 * Cascadeo automático en DB (FK con ON DELETE CASCADE):
 *   - empresa_configs, sedes, asesor_empresas, productos_autorizados,
 *     margenes_venta, precios_empresa_producto, odoo_configs,
 *     notificaciones, notificaciones_email.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authorized = await authorizeApiRoles(['super_admin', 'direccion']);
  if (authorized instanceof NextResponse) return authorized;

  const { admin, actor } = authorized;
  const { id: empresaId } = await context.params;

  let body: { confirmacion_nombre?: string; eliminar_logos?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  // 1. Verificar que la empresa exista.
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('id, nombre')
    .eq('id', empresaId)
    .maybeSingle();

  if (empresaError) {
    return NextResponse.json({ error: empresaError.message }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  // 2. Validar confirmación de nombre si se envía.
  if (body.confirmacion_nombre !== undefined) {
    const provisto = String(body.confirmacion_nombre).trim().toLowerCase();
    const real = String(empresa.nombre).trim().toLowerCase();
    if (provisto !== real) {
      return NextResponse.json(
        {
          error:
            'El nombre de confirmación no coincide con el nombre real de la empresa. ' +
            'Cancelando para evitar eliminación accidental.',
        },
        { status: 400 }
      );
    }
  }

  // 3. Verificar que NO tenga pedidos.
  const { count: pedidosCount, error: pedidosError } = await admin
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  if (pedidosError) {
    return NextResponse.json({ error: pedidosError.message }, { status: 500 });
  }
  if ((pedidosCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: 'No se puede eliminar la empresa: tiene pedidos asociados.',
        pedidos: pedidosCount,
        sugerencia:
          'Los pedidos preservan historial fiscal. Si realmente debes eliminar la empresa, ' +
          'primero exporta o reasigna los pedidos manualmente desde la base de datos.',
      },
      { status: 409 }
    );
  }

  // 4. Verificar que NO tenga usuarios (activos o inactivos).
  // El FK usuarios.empresa_id no tiene ON DELETE CASCADE, así que el DELETE
  // fallaría si hay usuarios. Forzamos limpieza previa explícita.
  const { count: usuariosCount, error: usuariosError } = await admin
    .from('usuarios')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  if (usuariosError) {
    return NextResponse.json({ error: usuariosError.message }, { status: 500 });
  }
  if ((usuariosCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: 'No se puede eliminar la empresa: tiene usuarios asociados.',
        usuarios: usuariosCount,
        sugerencia:
          'Elimina o reasigna los usuarios desde la sección "Gestión de Usuarios" antes ' +
          'de eliminar la empresa.',
      },
      { status: 409 }
    );
  }

  // 5. Capturar conteos de dependencias para el reporte de respuesta.
  const [sedesPre, asesoresPre, productosPre, margenesPre, overridesPre, configsPre] = await Promise.all([
    admin.from('sedes').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin
      .from('asesor_empresas')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    admin
      .from('productos_autorizados')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    admin.from('margenes_venta').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    admin
      .from('precios_empresa_producto')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId),
    admin.from('empresa_configs').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
  ]);

  // 6. Eliminar la empresa. CASCADE limpia todo lo dependiente.
  const { error: deleteError } = await admin.from('empresas').delete().eq('id', empresaId);

  if (deleteError) {
    return NextResponse.json(
      {
        error: 'Error eliminando la empresa.',
        details: deleteError.message,
      },
      { status: 500 }
    );
  }

  // 7. Limpieza opcional del bucket de Storage (logos).
  let storageEliminados = 0;
  let storageError: string | null = null;
  if (body.eliminar_logos === true) {
    try {
      const { data: archivos, error: listError } = await admin.storage
        .from(LOGOS_BUCKET)
        .list(empresaId);

      if (listError) {
        storageError = listError.message;
      } else if (archivos && archivos.length > 0) {
        const paths = archivos.map((f) => `${empresaId}/${f.name}`);
        const { error: removeError } = await admin.storage.from(LOGOS_BUCKET).remove(paths);
        if (removeError) {
          storageError = removeError.message;
        } else {
          storageEliminados = paths.length;
        }
      }
    } catch (err) {
      storageError = err instanceof Error ? err.message : 'Error desconocido limpiando Storage';
    }
  }

  // 8. Log mínimo en consola para trazabilidad operativa.
  console.info(
    `[API /admin/empresas/${empresaId}] DELETE ejecutado por actor ${actor.id} (${actor.rol}). ` +
      `Empresa eliminada: "${empresa.nombre}". Storage cleanup: ${
        body.eliminar_logos === true ? `${storageEliminados} archivo(s)` : 'omitido'
      }.`
  );

  return NextResponse.json({
    success: true,
    empresa_eliminada: {
      id: empresa.id,
      nombre: empresa.nombre,
    },
    cascada_db: {
      empresa_configs: configsPre.count ?? 0,
      sedes: sedesPre.count ?? 0,
      asesor_empresas: asesoresPre.count ?? 0,
      productos_autorizados: productosPre.count ?? 0,
      margenes_venta: margenesPre.count ?? 0,
      precios_empresa_producto: overridesPre.count ?? 0,
    },
    storage: {
      solicitado: body.eliminar_logos === true,
      archivos_eliminados: storageEliminados,
      error: storageError,
    },
  });
}
