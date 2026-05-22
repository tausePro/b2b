import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles, getAccessibleStorefrontIds } from '@/lib/auth/apiRouteGuards';
import {
  EMPAQUES_DEFAULT_LIMIT,
  EMPAQUES_MAX_LIMIT,
  EmpaquesConfigurationError,
  getEmpaquesCatalogData,
} from '@/lib/empaques/catalogo';

// Roles que pueden entrar a las rutas /admin de catálogo del storefront.
// - super_admin / direccion / editor_contenido: acceso global (heredan
//   permiso editorial sobre todos los storefronts).
// - asesor: sólo si está en asesor_storefronts(storefront_config_id, activo=true);
//   esto se valida más abajo contra el slug solicitado.
const EDITOR_ROLES = ['super_admin', 'direccion', 'editor_contenido', 'asesor'] as const;

function parsePositiveInteger(value: string | null) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

// Roles a los que la API expone el costo, margen efectivo y antigüedad del
// costo en cada producto. Asesores asignados al storefront entran porque
// son los responsables de negociar pricing (mismo criterio que para
// /api/admin/empresas/[id]/catalogo).
const COST_VISIBLE_ROLES = new Set(['super_admin', 'direccion', 'asesor']);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(EDITOR_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  if (slug !== 'empaques') {
    return NextResponse.json({ error: 'STOREFRONT_NOT_SUPPORTED' }, { status: 404 });
  }

  // Validación adicional: si es asesor, debe estar asignado al storefront.
  // Para super_admin / direccion / editor_contenido esto siempre pasa porque
  // getAccessibleStorefrontIds devuelve todos los storefronts.
  if (auth.actor.rol === 'asesor') {
    const { data: storefrontRow, error: storefrontError } = await auth.admin
      .from('storefront_configs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (storefrontError) {
      return NextResponse.json({ error: storefrontError.message }, { status: 500 });
    }

    if (!storefrontRow?.id) {
      return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });
    }

    const accessibles = await getAccessibleStorefrontIds(auth);
    if (!accessibles.includes(String(storefrontRow.id))) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          details: 'No tienes este storefront asignado.',
        },
        { status: 403 }
      );
    }
  }

  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search');
    const categoryId = parsePositiveInteger(searchParams.get('category_id'));
    const page = parsePositiveInteger(searchParams.get('page')) ?? 1;
    const requestedLimit = parsePositiveInteger(searchParams.get('limit'));
    const limit = requestedLimit
      ? Math.min(requestedLimit, EMPAQUES_MAX_LIMIT)
      : EMPAQUES_DEFAULT_LIMIT;

    const includeCostInfo = COST_VISIBLE_ROLES.has(auth.actor.rol);

    const data = await getEmpaquesCatalogData({
      search,
      categoryId,
      limit,
      page,
      includeInactive: true,
      includeCostInfo,
    });

    return NextResponse.json({
      query: data.query,
      storefront: data.storefront,
      categories: data.categories,
      productos: data.productos,
      total: data.total,
      totalPages: data.totalPages,
      selectedCategory: data.selectedCategory,
      searchTooShort: data.searchTooShort,
      minSearchLength: data.minSearchLength,
    });
  } catch (error) {
    if (error instanceof EmpaquesConfigurationError) {
      return NextResponse.json(
        {
          error: 'EMPAQUES_CONFIG_PENDING',
          details: error.message,
        },
        { status: 503 }
      );
    }

    console.error('[API /admin/storefronts/empaques/catalogo]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
