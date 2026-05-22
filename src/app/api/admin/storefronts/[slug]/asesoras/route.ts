import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeApiRoles,
  type AuthorizedApiContext,
} from '@/lib/auth/apiRouteGuards';

// Endpoints de gestión de asignaciones asesor ↔ storefront.
// Sólo super_admin y direccion pueden asignar o desasignar asesoras a un
// storefront. La asesora no puede gestionar sus propias asignaciones (eso
// se hace desde admin/empaques o desde la futura UI de asesoras).
const MANAGE_ROLES = ['super_admin', 'direccion'] as const;

async function resolveStorefrontIdBySlug(
  ctx: AuthorizedApiContext,
  slug: string
): Promise<{ storefrontId: string } | NextResponse> {
  const { data, error } = await ctx.admin
    .from('storefront_configs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.id) return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });

  return { storefrontId: String(data.id) };
}

// GET — Listar asesoras asignadas al storefront + asesoras disponibles para asignar.
//
// Respuesta:
//   {
//     asesoras: Array<{
//       id, usuario_id, storefront_config_id, activo,
//       created_at, updated_at,
//       usuario: { id, nombre, apellido, email, rol, activo } | null
//     }>,
//     disponibles: Array<{
//       id, nombre, apellido, email, activo,
//       asignada: boolean   // true si ya está en `asesoras` con activo=true
//     }>
//   }
//
// La razón de incluir `disponibles` en el mismo endpoint es evitar exponer un
// /api/admin/usuarios?rol=asesor genérico y mantener una sola llamada del UI.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(MANAGE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  const resolved = await resolveStorefrontIdBySlug(auth, slug);
  if (resolved instanceof NextResponse) return resolved;

  // 1. Asignaciones del storefront.
  const { data: asignaciones, error } = await auth.admin
    .from('asesor_storefronts')
    .select('id, usuario_id, storefront_config_id, activo, created_at, updated_at')
    .eq('storefront_config_id', resolved.storefrontId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(asignaciones) ? asignaciones : [];
  const usuarioIds = Array.from(new Set(rows.map((row) => String(row.usuario_id))));

  // 2. Todas las asesoras activas (para buscador de asignación).
  const { data: asesoresActivos, error: asesoresError } = await auth.admin
    .from('usuarios')
    .select('id, nombre, apellido, email, rol, activo')
    .eq('rol', 'asesor')
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (asesoresError) {
    return NextResponse.json({ error: asesoresError.message }, { status: 500 });
  }

  // 3. Asesoras asignadas que pueden ya no ser activas (e.g. fueron desactivadas
  //    pero se mantiene la asignación). Las mergeamos para no perder la info.
  let usuariosAsignadosById: Record<
    string,
    { id: string; nombre: string; apellido: string; email: string; rol: string; activo: boolean }
  > = {};

  if (usuarioIds.length > 0) {
    const { data: usuarios, error: usuariosError } = await auth.admin
      .from('usuarios')
      .select('id, nombre, apellido, email, rol, activo')
      .in('id', usuarioIds);

    if (usuariosError) {
      return NextResponse.json({ error: usuariosError.message }, { status: 500 });
    }

    usuariosAsignadosById = Object.fromEntries(
      (usuarios ?? []).map((u) => [
        String(u.id),
        {
          id: String(u.id),
          nombre: String(u.nombre ?? ''),
          apellido: String(u.apellido ?? ''),
          email: String(u.email ?? ''),
          rol: String(u.rol ?? ''),
          activo: Boolean(u.activo),
        },
      ])
    );
  }

  const asignadasActivasIds = new Set(
    rows.filter((row) => row.activo === true).map((row) => String(row.usuario_id))
  );

  const asesoras = rows.map((row) => ({
    id: String(row.id),
    usuario_id: String(row.usuario_id),
    storefront_config_id: String(row.storefront_config_id),
    activo: Boolean(row.activo),
    created_at: row.created_at,
    updated_at: row.updated_at,
    usuario: usuariosAsignadosById[String(row.usuario_id)] ?? null,
  }));

  const disponibles = (asesoresActivos ?? []).map((u) => ({
    id: String(u.id),
    nombre: String(u.nombre ?? ''),
    apellido: String(u.apellido ?? ''),
    email: String(u.email ?? ''),
    activo: Boolean(u.activo),
    asignada: asignadasActivasIds.has(String(u.id)),
  }));

  return NextResponse.json({ asesoras, disponibles });
}

// POST — Asignar una asesora al storefront
//
// Body: { usuario_id: string, activo?: boolean }
//
// Idempotente: si ya existe la asignación, se actualiza `activo`
// (re-activar es válido sin tener que borrar y recrear).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(MANAGE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  const resolved = await resolveStorefrontIdBySlug(auth, slug);
  if (resolved instanceof NextResponse) return resolved;

  const body = await request.json().catch(() => ({}));
  const usuarioId = typeof body?.usuario_id === 'string' ? body.usuario_id.trim() : '';
  const activo = typeof body?.activo === 'boolean' ? body.activo : true;

  if (!usuarioId) {
    return NextResponse.json({ error: 'usuario_id es requerido.' }, { status: 400 });
  }

  // Validamos que el usuario exista y sea asesor activo. Evita asignar
  // un comprador o un usuario inactivo al storefront por error.
  const { data: usuario, error: usuarioError } = await auth.admin
    .from('usuarios')
    .select('id, rol, activo')
    .eq('id', usuarioId)
    .maybeSingle();

  if (usuarioError) {
    return NextResponse.json({ error: usuarioError.message }, { status: 500 });
  }

  if (!usuario) {
    return NextResponse.json({ error: 'USUARIO_NOT_FOUND' }, { status: 404 });
  }

  if (usuario.rol !== 'asesor') {
    return NextResponse.json(
      {
        error: 'ROL_INVALIDO',
        details: 'Sólo usuarios con rol "asesor" pueden ser asignados a un storefront.',
      },
      { status: 400 }
    );
  }

  if (!usuario.activo) {
    return NextResponse.json(
      {
        error: 'USUARIO_INACTIVO',
        details: 'El usuario está inactivo; activarlo antes de asignarlo al storefront.',
      },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await auth.admin
    .from('asesor_storefronts')
    .upsert(
      {
        usuario_id: usuarioId,
        storefront_config_id: resolved.storefrontId,
        activo,
        updated_at: nowIso,
      },
      { onConflict: 'usuario_id,storefront_config_id' }
    )
    .select('id, usuario_id, storefront_config_id, activo, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ asesora: data });
}

// DELETE — Desasignar una asesora del storefront.
//
// Query: ?usuario_id=<uuid>
//
// Estrategia: borramos físicamente la fila. Si en el futuro se quiere
// auditar histórico, se puede cambiar a soft delete con activo=false.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(MANAGE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  const resolved = await resolveStorefrontIdBySlug(auth, slug);
  if (resolved instanceof NextResponse) return resolved;

  const { searchParams } = new URL(request.url);
  const usuarioId = searchParams.get('usuario_id');

  if (!usuarioId) {
    return NextResponse.json({ error: 'usuario_id es requerido como query param.' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('asesor_storefronts')
    .delete()
    .eq('storefront_config_id', resolved.storefrontId)
    .eq('usuario_id', usuarioId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
