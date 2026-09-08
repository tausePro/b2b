import { NextRequest, NextResponse } from 'next/server';
import {
  EmpaquesConfigurationError,
  getEmpaquesProductImage,
} from '@/lib/empaques/catalogo';
import { parseEmpaquesImageSize } from '@/lib/empaques/product-images';

export const runtime = 'nodejs';

// GET /api/empaques/imagen/[id]?s=1024&v=<write_date>
//
// Sirve la fotografía de un product.template visible en el storefront público
// de Empaques directamente desde Odoo, en vez de inyectar base64 en el HTML.
// `s` es uno de los tamaños que Odoo materializa (128/256/512/1024/1920);
// `v` solo versiona la URL para invalidar cachés cuando cambia la foto.
//
// La respuesta se cachea en el CDN (s-maxage) y en el optimizador de
// next/image, que consume esta ruta como origen para generar srcset/WebP.
const IMAGE_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const MISS_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';

function parseProductId(value: string) {
  if (!/^\d{1,10}$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const productId = parseProductId(id);
  if (!productId) {
    return NextResponse.json({ error: 'PRODUCT_ID_INVALID' }, { status: 400 });
  }

  const size = parseEmpaquesImageSize(request.nextUrl.searchParams.get('s'));
  if (!size) {
    return NextResponse.json({ error: 'IMAGE_SIZE_INVALID' }, { status: 400 });
  }

  try {
    const image = await getEmpaquesProductImage(productId, size);
    if (!image) {
      return NextResponse.json(
        { error: 'IMAGE_NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': MISS_CACHE_CONTROL } }
      );
    }

    const body = Buffer.from(image.base64, 'base64');
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(body.byteLength),
        'Cache-Control': IMAGE_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof EmpaquesConfigurationError) {
      return NextResponse.json(
        { error: 'EMPAQUES_CONFIG_PENDING', details: error.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.error('[API /empaques/imagen]', error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
