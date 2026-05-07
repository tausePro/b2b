import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';

const EDITOR_ROLES = ['super_admin', 'direccion', 'editor_contenido'] as const;
const SELECT_FIELDS = 'id, storefront_config_id, odoo_product_id, nombre_publico, slug, descripcion_corta, descripcion_larga, imagen_url, galeria, beneficios, usos_recomendados, especificaciones, faqs, orden, visible, destacado, seo_title, seo_description, contenido_extra, estado_publicacion, creado_por, actualizado_por, publicado_at, created_at, updated_at';

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

function cleanArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cleanObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isMissingEditorialTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error
    && (
      error.code === 'PGRST205'
      || error.message?.includes("Could not find the table 'public.storefront_product_overrides'")
      || error.message?.includes('storefront_product_overrides')
    )
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontContext(slug);
  if (resolved instanceof NextResponse) return resolved;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('odoo_product_id');
  let query = resolved.auth.admin
    .from('storefront_product_overrides')
    .select(SELECT_FIELDS)
    .eq('storefront_config_id', resolved.storefrontId)
    .order('orden', { ascending: true })
    .order('odoo_product_id', { ascending: true });

  if (productId) {
    const parsed = Number(productId);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'odoo_product_id debe ser un número positivo.' }, { status: 400 });
    }
    query = query.eq('odoo_product_id', Math.trunc(parsed));
  }

  const { data, error } = await query;

  if (isMissingEditorialTableError(error)) {
    return NextResponse.json({ productos: [], migrationPending: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ productos: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await getStorefrontContext(slug);
  if (resolved instanceof NextResponse) return resolved;

  const body = await request.json();
  const odooProductId = Number(body.odoo_product_id);
  const estadoPublicacion = cleanPublicationState(body.estado_publicacion);

  if (!Number.isFinite(odooProductId) || odooProductId <= 0) {
    return NextResponse.json({ error: 'odoo_product_id debe ser un número positivo.' }, { status: 400 });
  }

  const { data, error } = await resolved.auth.admin
    .from('storefront_product_overrides')
    .upsert(
      {
        storefront_config_id: resolved.storefrontId,
        odoo_product_id: Math.trunc(odooProductId),
        nombre_publico: cleanText(body.nombre_publico),
        slug: cleanText(body.slug),
        descripcion_corta: cleanText(body.descripcion_corta),
        descripcion_larga: cleanText(body.descripcion_larga),
        imagen_url: cleanText(body.imagen_url),
        galeria: cleanArray(body.galeria),
        beneficios: cleanArray(body.beneficios),
        usos_recomendados: cleanArray(body.usos_recomendados),
        especificaciones: cleanObject(body.especificaciones),
        faqs: cleanArray(body.faqs),
        orden: Number.isFinite(Number(body.orden)) ? Math.trunc(Number(body.orden)) : 0,
        visible: typeof body.visible === 'boolean' ? body.visible : true,
        destacado: typeof body.destacado === 'boolean' ? body.destacado : false,
        seo_title: cleanText(body.seo_title),
        seo_description: cleanText(body.seo_description),
        contenido_extra: cleanObject(body.contenido_extra),
        estado_publicacion: estadoPublicacion,
        actualizado_por: resolved.auth.actor.id,
        publicado_at: estadoPublicacion === 'publicado' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'storefront_config_id,odoo_product_id' }
    )
    .select(SELECT_FIELDS)
    .single();

  if (isMissingEditorialTableError(error)) {
    return NextResponse.json({ error: 'MIGRATION_PENDING', details: 'Ejecuta la migración 038_storefront_editorial_overrides.sql antes de guardar contenido editorial.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ producto: data });
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
    .from('storefront_product_overrides')
    .delete()
    .eq('id', overrideId)
    .eq('storefront_config_id', resolved.storefrontId);

  if (isMissingEditorialTableError(error)) {
    return NextResponse.json({ error: 'MIGRATION_PENDING', details: 'Ejecuta la migración 038_storefront_editorial_overrides.sql antes de eliminar contenido editorial.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
