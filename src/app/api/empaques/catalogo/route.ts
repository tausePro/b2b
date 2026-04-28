import { NextRequest, NextResponse } from 'next/server';
import {
  EMPAQUES_DEFAULT_LIMIT,
  EMPAQUES_MAX_LIMIT,
  EmpaquesConfigurationError,
  getEmpaquesCatalogData,
} from '@/lib/empaques/catalogo';

function parsePositiveInteger(value: string | null) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search');
    const categoryId = parsePositiveInteger(searchParams.get('category_id'));
    const page = parsePositiveInteger(searchParams.get('page')) ?? 1;
    const requestedLimit = parsePositiveInteger(searchParams.get('limit'));
    const limit = requestedLimit
      ? Math.min(requestedLimit, EMPAQUES_MAX_LIMIT)
      : EMPAQUES_DEFAULT_LIMIT;

    const data = await getEmpaquesCatalogData({
      search,
      categoryId,
      limit,
      page,
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

    console.error('[API /empaques/catalogo]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
