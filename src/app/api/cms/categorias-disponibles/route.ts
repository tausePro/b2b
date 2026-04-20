import { NextResponse } from 'next/server';
import { obtenerContextoCms } from '@/lib/landing/authCms';
import { getPublicCatalogRootCategories } from '@/lib/catalogoPublico';

/**
 * GET /api/cms/categorias-disponibles
 * Devuelve las categorías raíz del catálogo público (las mismas que ve el
 * cliente B2B en /catalogo). Se consume desde el editor CMS para que el admin
 * seleccione qué categorías mostrar en la sección "Categorías" del home.
 *
 * Requiere rol CMS (super_admin / direccion / editor_contenido).
 */
export async function GET() {
  try {
    const ctx = await obtenerContextoCms();
    if (!ctx) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const categorias = await getPublicCatalogRootCategories();
    return NextResponse.json({ categorias });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar categorías';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
