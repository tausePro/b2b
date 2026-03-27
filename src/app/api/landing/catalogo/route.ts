import { NextRequest, NextResponse } from 'next/server';
import {
  PUBLIC_CATALOG_DEFAULT_LIMIT,
  PUBLIC_CATALOG_MAX_LIMIT,
  getPublicCatalogPageData,
} from '@/lib/catalogoPublico';

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
      ? Math.min(requestedLimit, PUBLIC_CATALOG_MAX_LIMIT)
      : PUBLIC_CATALOG_DEFAULT_LIMIT;

    const data = await getPublicCatalogPageData({
      search,
      categoryId,
      limit,
      page,
    });

    return NextResponse.json({
      query: data.query,
      productos: data.productos,
      total: data.total,
      totalPages: data.totalPages,
      selectedCategory: data.selectedCategory,
      searchTooShort: data.searchTooShort,
      minSearchLength: data.minSearchLength,
    });
  } catch (error) {
    console.error('[API /landing/catalogo]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
