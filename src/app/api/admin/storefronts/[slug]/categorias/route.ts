import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';

const EDITOR_ROLES = ['super_admin', 'direccion', 'editor_contenido'] as const;
const SELECT_FIELDS = 'id, storefront_config_id, odoo_categ_id, nombre_publico, slug, descripcion_corta, descripcion_larga, imagen_url, orden, visible, destacado, seo_title, seo_description, contenido_extra, estado_publicacion, creado_por, actualizado_por, publicado_at, created_at, updated_at';

async function getStorefrontContext(slug: string) {
  const auth = await authorizeApiRoles(EDITOR_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.admin
    .from('storefront_configs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.id) return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });

  return { auth, storefrontId: String(data.id) };
}

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanPublicationState(value: unknown) {
  return value === 'publicado' ? 'publicado' : 'borrador';
}

function isMissingEditorialTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error
    && (
      error.code === 'PGRST205'
      || error.message?.includes("Could not find the table 'public.storefront_category_overrides'")
      || error.message?.includes('storefront_category_overrides')
    )
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontContext(slug);
  if (resolved instanceof NextResponse) return resolved;

  const { data, error } = await resolved.auth.admin
    .from('storefront_category_overrides')
    .select(SELECT_FIELDS)
    .eq('storefront_config_id', resolved.storefrontId)
    .order('orden', { ascending: true })
    .order('odoo_categ_id', { ascending: true });

  if (isMissingEditorialTableError(error)) {
    return NextResponse.json({ categorias: [], migrationPending: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categorias: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontContext(slug);
  if (resolved instanceof NextResponse) return resolved;

  const body = await request.json();
  const odooCategId = Number(body.odoo_categ_id);
  const estadoPublicacion = cleanPublicationState(body.estado_publicacion);

  if (!Number.isFinite(odooCategId) || odooCategId <= 0) {
    return NextResponse.json({ error: 'odoo_categ_id debe ser un número positivo.' }, { status: 400 });
  }

  const { data, error } = await resolved.auth.admin
    .from('storefront_category_overrides')
    .upsert(
      {
        storefront_config_id: resolved.storefrontId,
        odoo_categ_id: Math.trunc(odooCategId),
        nombre_publico: cleanText(body.nombre_publico),
        slug: cleanText(body.slug),
        descripcion_corta: cleanText(body.descripcion_corta),
        descripcion_larga: cleanText(body.descripcion_larga),
        imagen_url: cleanText(body.imagen_url),
        orden: Number.isFinite(Number(body.orden)) ? Math.trunc(Number(body.orden)) : 0,
        visible: typeof body.visible === 'boolean' ? body.visible : true,
        destacado: typeof body.destacado === 'boolean' ? body.destacado : false,
        seo_title: cleanText(body.seo_title),
        seo_description: cleanText(body.seo_description),
        contenido_extra: body.contenido_extra && typeof body.contenido_extra === 'object' ? body.contenido_extra : {},
        estado_publicacion: estadoPublicacion,
        actualizado_por: resolved.auth.actor.id,
        publicado_at: estadoPublicacion === 'publicado' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'storefront_config_id,odoo_categ_id' }
    )
    .select(SELECT_FIELDS)
    .single();

  if (isMissingEditorialTableError(error)) {
    return NextResponse.json({ error: 'MIGRATION_PENDING', details: 'Ejecuta la migración 038_storefront_editorial_overrides.sql antes de guardar contenido editorial.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categoria: data });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontContext(slug);
  if (resolved instanceof NextResponse) return resolved;

  const { searchParams } = new URL(request.url);
  const overrideId = searchParams.get('override_id');

  if (!overrideId) {
    return NextResponse.json({ error: 'override_id es requerido.' }, { status: 400 });
  }

  const { error } = await resolved.auth.admin
    .from('storefront_category_overrides')
    .delete()
    .eq('id', overrideId)
    .eq('storefront_config_id', resolved.storefrontId);

  if (isMissingEditorialTableError(error)) {
    return NextResponse.json({ error: 'MIGRATION_PENDING', details: 'Ejecuta la migración 038_storefront_editorial_overrides.sql antes de eliminar contenido editorial.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
