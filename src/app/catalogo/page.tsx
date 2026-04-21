import type { Metadata } from 'next';
import PublicCatalogClient, {
  type CatalogoBannerConfig,
} from '@/components/public/PublicCatalogClient';
import PublicLayout from '@/components/public/PublicLayout';
import { getPublicCatalogPageData } from '@/lib/catalogoPublico';
import { getSeccion } from '@/lib/landing/getContenido';

export const metadata: Metadata = {
  title: 'Catálogo público | Imprima',
  description: 'Explore el catálogo público de Imprima por categorías reales y búsqueda rápida.',
};

// Obtiene el banner administrado desde el CMS. Devuelve null si no existe,
// si esta inactivo, o si el admin no ha subido imagen. PublicCatalogClient
// caera al hero de texto por defecto en esos casos.
async function getBanner(): Promise<CatalogoBannerConfig | null> {
  try {
    const seccion = await getSeccion('catalogo_banner');
    if (!seccion || !seccion.activo) return null;
    if (!seccion.imagen_url) return null;
    const c = (seccion.contenido || {}) as Record<string, unknown>;
    // overlay_color/overlay_opacity son opcionales en BD. Defaults pensados
    // para alto contraste con texto blanco: slate-900 al 60%.
    const overlayColor = typeof c.overlay_color === 'string' ? c.overlay_color : '#0f172a';
    const overlayOpacity = typeof c.overlay_opacity === 'number' ? c.overlay_opacity : 60;
    return {
      titulo: seccion.titulo || '',
      subtitulo: seccion.subtitulo || '',
      imagen_url: seccion.imagen_url,
      cta_texto: typeof c.cta_texto === 'string' ? c.cta_texto : '',
      // mensaje_prefill opcional: si esta vacio, PublicCatalogClient
      // usa el fallback definido en CATALOGO_BANNER_PREFILL_DEFAULT.
      mensaje_prefill:
        typeof c.mensaje_prefill === 'string' ? c.mensaje_prefill : undefined,
      overlay_color: overlayColor,
      overlay_opacity: overlayOpacity,
    };
  } catch {
    return null;
  }
}

type CatalogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function CatalogoPublicoPage({ searchParams }: CatalogPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = getSingleSearchParam(resolvedSearchParams?.q);
  const categoryParam = getSingleSearchParam(resolvedSearchParams?.categoria);
  const pageParam = getSingleSearchParam(resolvedSearchParams?.page);
  const categoryId = Number.parseInt(categoryParam, 10);
  const page = Number.parseInt(pageParam, 10);
  const [initialData, banner] = await Promise.all([
    getPublicCatalogPageData({
      search,
      categoryId: Number.isFinite(categoryId) ? categoryId : null,
      page: Number.isFinite(page) ? page : 1,
    }),
    getBanner(),
  ]);

  return (
    <PublicLayout>
      <PublicCatalogClient initialData={initialData} banner={banner} />
    </PublicLayout>
  );
}
