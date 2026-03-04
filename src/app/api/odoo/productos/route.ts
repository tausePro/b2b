import { NextResponse, NextRequest } from 'next/server';
import {
  authenticate,
  getProductos,
  getProductosByPartner,
  getEtiquetasProducto,
  getConfigFromEnv,
} from '@/lib/odoo/client';

export async function GET(request: NextRequest) {
  try {
    const config = getConfigFromEnv();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de Odoo no encontrada en variables de entorno' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partner_id');
    const tagIds = searchParams.get('tag_ids');
    const categIds = searchParams.get('categ_ids');
    const includeTagNames = searchParams.get('include_tag_names') === 'true';
    const limit = parseInt(searchParams.get('limit') || '200', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const parsedCategIds = (categIds || '')
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter(Boolean);

    const session = await authenticate(config);

    let productos;

    if (partnerId) {
      // Productos filtrados por etiquetas del partner (cliente)
      productos = await getProductosByPartner(session, parseInt(partnerId, 10), {
        limit,
        offset,
        categIds: parsedCategIds,
      });
    } else if (tagIds) {
      // Productos filtrados por IDs de etiquetas específicas
      const ids = tagIds.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
      productos = await getProductos(session, { tagIds: ids, categIds: parsedCategIds, limit, offset });
    } else {
      // Todos los productos activos
      productos = await getProductos(session, { categIds: parsedCategIds, limit, offset });
    }

    if (includeTagNames) {
      const etiquetas = await getEtiquetasProducto(session);
      const etiquetasMap = new Map(etiquetas.map((tag) => [tag.id, tag.name]));
      const productosConEtiquetas = productos.map((producto) => ({
        ...producto,
        product_tags: (producto.product_tag_ids || []).map((tagId) => [tagId, etiquetasMap.get(tagId) || `Etiqueta ${tagId}`]),
      }));

      return NextResponse.json({ productos: productosConEtiquetas, total: productosConEtiquetas.length });
    }

    return NextResponse.json({ productos, total: productos.length });
  } catch (err) {
    console.error('[API /odoo/productos]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
