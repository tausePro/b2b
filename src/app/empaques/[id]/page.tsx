import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  Package,
} from 'lucide-react';
import { EmpaquesFooter, EmpaquesHeader } from '@/components/public/EmpaquesChrome';
import LeadButton from '@/components/public/LeadButton';
import {
  getEmpaquesProductDetail,
  type EmpaquesCatalogProduct,
} from '@/lib/empaques/catalogo';
import {
  getEmpaquesProductImageSrc,
  hasEmpaquesEditorialImage,
} from '@/lib/empaques/product-images';

type EmpaquesProductPageProps = {
  params: Promise<{ id: string }>;
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function parseProductId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getDescription(product: EmpaquesCatalogProduct) {
  if (typeof product.description_sale === 'string' && product.description_sale.trim()) {
    return product.description_sale.trim();
  }
  return null;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: EmpaquesProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const productId = parseProductId(id);
  if (!productId) return { title: 'Producto no encontrado | Empaques Imprima' };

  const data = await getEmpaquesProductDetail(productId);
  if (!data) return { title: 'Producto no encontrado | Empaques Imprima' };

  const { product } = data;
  const description = product.seo_description
    || getDescription(product)
    || product.descripcion_larga
    || `${product.name} — Soluciones de Empaques Imprima`;

  return {
    title: product.seo_title || `${product.name} | Empaques Imprima`,
    description: description.slice(0, 160),
    openGraph: {
      title: product.seo_title || product.name,
      description: description.slice(0, 160),
      images: product.image_url ? [{ url: product.image_url, alt: product.name }] : undefined,
    },
  };
}

function RelatedProductCard({ product }: { product: EmpaquesCatalogProduct }) {
  const imageSrc = getEmpaquesProductImageSrc(product);
  const editorialImage = hasEmpaquesEditorialImage(product);

  return (
    <Link
      href={`/empaques/${product.id}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-[#9CBB06]/50 hover:shadow-xl"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F1F1EE]">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={product.name}
            fill
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
            unoptimized
            className={`${editorialImage ? 'object-contain p-4' : 'object-cover'} transition duration-500 group-hover:scale-105`}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-slate-300" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-5">
        {product.default_code && (
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{product.default_code}</p>
        )}
        <h3 className="line-clamp-2 min-h-10 font-black leading-tight text-slate-950">{product.name}</h3>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="font-black text-slate-950">
            {product.price === null ? 'Cotizar' : currencyFormatter.format(product.price)}
          </span>
          <ArrowRight className="h-4 w-4 text-[#9CBB06] transition group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}

export default async function EmpaquesProductPage({ params }: EmpaquesProductPageProps) {
  const { id } = await params;
  const productId = parseProductId(id);
  if (!productId) notFound();

  const data = await getEmpaquesProductDetail(productId);
  if (!data) notFound();

  const { product, related, category } = data;
  const imageSrc = getEmpaquesProductImageSrc(product, 'detail');
  const description = getDescription(product);
  const leadMessage = `Estoy interesado en ${product.name}${product.default_code ? ` (ref. ${product.default_code})` : ''}.`;

  return (
    <div className="min-h-screen bg-[#F8F8F5] text-slate-950 antialiased">
      <EmpaquesHeader sectionBasePath="/empaques" />
      <main>
        <section className="px-4 pb-24 pt-10 sm:px-6 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="mx-auto max-w-7xl">
            <nav className="mb-8 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-500">
              <Link href="/empaques" className="transition hover:text-[#9CBB06]">Empaques</Link>
              <ChevronRight className="h-4 w-4 shrink-0" />
              <Link
                href={`/empaques?categoria=${category.id}`}
                className="truncate transition hover:text-[#9CBB06]"
              >
                {category.name}
              </Link>
              <ChevronRight className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="hidden max-w-xs truncate text-slate-800 sm:block">{product.name}</span>
            </nav>

            <Link
              href={`/empaques?categoria=${category.id}`}
              className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a {category.name}
            </Link>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#F1F1EE]">
                  {imageSrc ? (
                    <Image
                      src={imageSrc}
                      alt={product.name}
                      fill
                      sizes="(max-width: 1023px) 100vw, 55vw"
                      unoptimized
                      priority
                      className="object-contain p-2 sm:p-4"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-[#D9E997]">
                        <Package className="h-16 w-16 text-slate-700" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-7 lg:py-4">
                <div className="space-y-4">
                  <Link
                    href={`/empaques?categoria=${category.id}`}
                    className="inline-flex rounded-full bg-[#D9E997] px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 transition hover:bg-[#cddd82]"
                  >
                    {category.name}
                  </Link>
                  <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
                    {product.name}
                  </h1>
                  {product.default_code && (
                    <p className="font-mono text-sm font-bold text-slate-400">Referencia: {product.default_code}</p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Precio público</p>
                  {product.price === null ? (
                    <p className="mt-2 text-2xl font-black text-amber-700">Cotización personalizada</p>
                  ) : (
                    <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                      {currencyFormatter.format(product.price)}
                    </p>
                  )}
                  <p className="mt-2 text-sm font-semibold text-slate-500">Precio antes de IVA.</p>
                </div>

                {description && (
                  <p className="whitespace-pre-line text-base font-semibold leading-8 text-slate-600">
                    {description}
                  </p>
                )}

                {product.descripcion_larga && product.descripcion_larga !== description && (
                  <div className="whitespace-pre-line rounded-2xl bg-white p-5 text-sm font-semibold leading-7 text-slate-600 shadow-sm">
                    {product.descripcion_larga}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Unidad de medida</p>
                    <p className="mt-2 font-black text-slate-950">{product.uom_name}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Disponibilidad</p>
                    <p className="mt-2 flex items-center gap-2 font-black text-slate-950">
                      <CheckCircle2 className="h-4 w-4 text-[#9CBB06]" />
                      {product.requiere_precio_manual ? 'Bajo cotización' : 'Disponible'}
                    </p>
                  </div>
                  {product.product_variant_count > 1 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Variantes</p>
                      <p className="mt-2 font-black text-slate-950">{product.product_variant_count} opciones en Odoo</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <LeadButton
                    fuente={`empaques_producto_${product.id}`}
                    texto={product.requiere_precio_manual ? 'Solicitar cotización' : 'Cotizar este producto'}
                    variant="primary"
                    mensajePrefill={leadMessage}
                    className="w-full justify-center rounded-full bg-[#9CBB06] px-7 py-4 text-base font-black text-slate-950 hover:bg-[#8cab05] sm:w-auto"
                  />
                  {product.ficha_tecnica_url && (
                    <a
                      href={product.ficha_tecnica_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-7 py-4 text-base font-black text-slate-700 transition hover:border-[#9CBB06] hover:text-slate-950 sm:w-auto"
                    >
                      <FileText className="h-4 w-4" />
                      Ver ficha técnica
                    </a>
                  )}
                </div>
              </div>
            </div>

            {related.length > 0 && (
              <section className="mt-20 border-t border-slate-200 pt-14">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9CBB06]">También te puede interesar</p>
                    <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Productos relacionados</h2>
                  </div>
                  <Link
                    href={`/empaques?categoria=${category.id}`}
                    className="inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-slate-950"
                  >
                    Ver toda la categoría
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {related.map((relatedProduct) => (
                    <RelatedProductCard key={relatedProduct.id} product={relatedProduct} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </main>
      <EmpaquesFooter sectionBasePath="/empaques" />
    </div>
  );
}
