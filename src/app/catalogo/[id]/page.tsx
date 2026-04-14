import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Package } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';
import LeadButton from '@/components/public/LeadButton';
import { getPublicProductDetail } from '@/lib/catalogoPublico';

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const productId = parseInt(id, 10);
  if (!Number.isFinite(productId) || productId <= 0) {
    return { title: 'Producto no encontrado | Imprima' };
  }

  const data = await getPublicProductDetail(productId);
  if (!data) {
    return { title: 'Producto no encontrado | Imprima' };
  }

  const description = typeof data.product.description_sale === 'string'
    ? data.product.description_sale.slice(0, 160)
    : `${data.product.name} — Catálogo Imprima`;

  return {
    title: `${data.product.name} | Catálogo Imprima`,
    description,
  };
}

export default async function ProductoDetallePage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = parseInt(id, 10);
  if (!Number.isFinite(productId) || productId <= 0) {
    notFound();
  }

  const data = await getPublicProductDetail(productId);
  if (!data) {
    notFound();
  }

  const { product, related, category } = data;
  const imageSource = product.image_1920 || product.image_128;
  const categoriaLabel = Array.isArray(product.categ_id) ? product.categ_id[1] : null;
  const description = typeof product.description_sale === 'string' ? product.description_sale : null;

  return (
    <PublicLayout>
      <section className="pt-12 pb-24 lg:pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/catalogo" className="hover:text-primary transition-colors">
              Catálogo
            </Link>
            {category && (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <Link
                  href={`/catalogo?categoria=${category.id}`}
                  className="hover:text-primary transition-colors"
                >
                  {category.name}
                </Link>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-slate-900 font-medium truncate max-w-[200px]">{product.name}</span>
          </nav>

          {/* Producto */}
          <div className="grid gap-10 lg:grid-cols-2">
            {/* Imagen */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="relative aspect-square flex items-center justify-center">
                {imageSource ? (
                  <Image
                    src={`data:image/png;base64,${imageSource}`}
                    alt={product.name}
                    fill
                    unoptimized
                    className="object-contain p-4"
                    priority
                  />
                ) : (
                  <Package className="h-24 w-24 text-slate-200" />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-col justify-center space-y-6">
              {categoriaLabel && (
                <Link
                  href={`/catalogo?categoria=${Array.isArray(product.categ_id) ? product.categ_id[0] : ''}`}
                  className="inline-flex self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
                >
                  {categoriaLabel}
                </Link>
              )}

              <h1 className="text-3xl font-extrabold leading-tight text-slate-900 lg:text-4xl">
                {product.name}
              </h1>

              {typeof product.default_code === 'string' && product.default_code && (
                <p className="text-sm font-mono text-slate-400">Referencia: {product.default_code}</p>
              )}

              {description && (
                <div className="prose prose-slate prose-sm max-w-none">
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">{description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Unidad de Medida</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{product.uom_name}</p>
                </div>
                {product.product_variant_count > 1 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-medium text-slate-500">Variantes</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{product.product_variant_count} opciones</p>
                  </div>
                )}
              </div>

              {/* CTAs */}
              <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-bold text-slate-900 shadow-lg shadow-primary/20 transition hover:bg-primary/90"
                >
                  Acceso clientes B2B
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <LeadButton
                  fuente={`producto_${product.id}`}
                  texto="Hablar con un asesor"
                  variant="whatsapp"
                  className="px-6 py-3.5"
                />
              </div>
            </div>
          </div>

          {/* Productos relacionados */}
          {related.length > 0 && (
            <div className="mt-20">
              <h2 className="text-2xl font-extrabold text-slate-900">Productos relacionados</h2>
              <p className="mt-2 text-sm text-slate-500">
                Otros productos en {category?.name || 'la misma categoría'}
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {related.map((rel) => {
                  const relCategLabel = Array.isArray(rel.categ_id) ? rel.categ_id[1] : '';
                  return (
                    <Link
                      key={rel.id}
                      href={`/catalogo/${rel.id}`}
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                    >
                      <div className="relative flex h-36 items-center justify-center bg-slate-50 p-4">
                        {rel.image_128 ? (
                          <Image
                            src={`data:image/png;base64,${rel.image_128}`}
                            alt={rel.name}
                            fill
                            unoptimized
                            loading="lazy"
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-contain p-4"
                          />
                        ) : (
                          <Package className="h-10 w-10 text-slate-200" />
                        )}
                      </div>
                      <div className="p-4">
                        {relCategLabel && (
                          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            {relCategLabel}
                          </span>
                        )}
                        <h3 className="mt-2 text-sm font-bold leading-snug text-slate-900">{rel.name}</h3>
                        {typeof rel.default_code === 'string' && rel.default_code && (
                          <p className="mt-1 text-xs font-mono text-slate-400">Ref: {rel.default_code}</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA final */}
          <div className="mt-16 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
            <h3 className="text-2xl font-extrabold text-slate-900">¿Interesado en este producto?</h3>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Registre su empresa para acceder a precios B2B, listas personalizadas y flujo formal de pedidos.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 font-bold text-slate-900 shadow-xl shadow-primary/20 transition hover:bg-primary/90"
              >
                Acceso clientes B2B
                <ArrowRight className="h-4 w-4" />
              </Link>
              <LeadButton fuente={`producto_${product.id}_cta`} texto="Hablar con un asesor" variant="whatsapp" className="px-8 py-3.5" />
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
