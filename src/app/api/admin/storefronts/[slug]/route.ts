import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdmin } from '@/lib/admin/auth';

function parseIntegerArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
      .map((item) => Math.trunc(item))
  ));
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizePricingMode(value: unknown) {
  return value === 'pricelist' ? 'pricelist' : 'costo_margen';
}

async function resolveStorefront(slug: string) {
  const auth = await authorizeAdmin();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.admin
    .from('storefront_configs')
    .select('id, slug, nombre, subdominio, modo_pricing, activo, odoo_root_category_ids, odoo_excluded_category_ids, configuracion_extra, created_at, updated_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });
  }

  return { auth, storefront: data };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await resolveStorefront(slug);
  if (resolved instanceof NextResponse) return resolved;

  return NextResponse.json({ storefront: resolved.storefront });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const resolved = await resolveStorefront(slug);
  if (resolved instanceof NextResponse) return resolved;

  const body = await request.json();
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const subdominio = typeof body.subdominio === 'string' && body.subdominio.trim() ? body.subdominio.trim() : null;
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
  const rootCategoryIds = parseIntegerArray(body.odoo_root_category_ids);
  const excludedCategoryIds = parseIntegerArray(body.odoo_excluded_category_ids);

  if (!nombre) {
    return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
  }

  if (rootCategoryIds.length === 0) {
    return NextResponse.json({ error: 'Debe existir al menos una categoría raíz Odoo.' }, { status: 400 });
  }

  const currentExtra = resolved.storefront.configuracion_extra && typeof resolved.storefront.configuracion_extra === 'object'
    ? resolved.storefront.configuracion_extra as Record<string, unknown>
    : {};

  const { data, error } = await resolved.auth.admin
    .from('storefront_configs')
    .update({
      nombre,
      subdominio,
      modo_pricing: normalizePricingMode(body.modo_pricing),
      activo: normalizeBoolean(body.activo, Boolean(resolved.storefront.activo)),
      odoo_root_category_ids: rootCategoryIds,
      odoo_excluded_category_ids: excludedCategoryIds,
      configuracion_extra: {
        ...currentExtra,
        descripcion,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolved.storefront.id)
    .select('id, slug, nombre, subdominio, modo_pricing, activo, odoo_root_category_ids, odoo_excluded_category_ids, configuracion_extra, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ storefront: data });
}
