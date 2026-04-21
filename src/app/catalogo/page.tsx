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
    return {
      titulo: seccion.titulo || '',
      subtitulo: seccion.subtitulo || '',
      imagen_url: seccion.imagen_url,
      cta_texto: typeof c.cta_texto === 'string' ? c.cta_texto : '',
      cta_url: typeof c.cta_url === 'string' ? c.cta_url : '',
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
