import type { Metadata } from 'next';
import PublicCatalogClient from '@/components/public/PublicCatalogClient';
import PublicLayout from '@/components/public/PublicLayout';
import { getPublicCatalogPageData } from '@/lib/catalogoPublico';

export const metadata: Metadata = {
  title: 'Catálogo público | Imprima',
  description: 'Explore el catálogo público de Imprima por categorías reales y búsqueda rápida.',
};

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
  const initialData = await getPublicCatalogPageData({
    search,
    categoryId: Number.isFinite(categoryId) ? categoryId : null,
    page: Number.isFinite(page) ? page : 1,
  });

  return (
    <PublicLayout>
      <PublicCatalogClient initialData={initialData} />
    </PublicLayout>
  );
}
