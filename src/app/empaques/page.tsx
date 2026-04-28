import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Building2,
  Leaf,
  Package,
  Route,
  Search,
  Sparkles,
} from 'lucide-react';
import EmpaquesQuoteForm from '@/components/public/EmpaquesQuoteForm';
import LeadButton from '@/components/public/LeadButton';
import {
  EMPAQUES_DEFAULT_LIMIT,
  EmpaquesConfigurationError,
  type EmpaquesCatalogData,
  type EmpaquesCategoryNode,
  type EmpaquesCatalogProduct,
  getEmpaquesPublicAvailability,
  getEmpaquesCatalogData,
} from '@/lib/empaques/catalogo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Empaques | Imprima',
  description: 'Catálogo público de soluciones de empaque y cafetería de Imprima.',
};

type EmpaquesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const EMPAQUES_FEATURED_CATEGORY_ID = 132;

function getSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildCategoryHref(categoryId: number | null, search: string) {
  const params = new URLSearchParams();
  if (categoryId) params.set('categoria', String(categoryId));
  if (search) params.set('q', search);
  const query = params.toString();
  return query ? `/empaques?${query}` : '/empaques';
}

function getProductImageSrc(product: EmpaquesCatalogProduct) {
  return typeof product.image_128 === 'string' && product.image_128.length > 0
    ? `data:image/png;base64,${product.image_128}`
    : null;
}

function getFeaturedProduct(products: EmpaquesCatalogProduct[], index = 0) {
  const productsWithImage = products.filter((product) => getProductImageSrc(product));
  return productsWithImage[index] ?? products[index] ?? null;
}

function getCategoryProduct(products: EmpaquesCatalogProduct[], category: EmpaquesCategoryNode) {
  return products.find((product) => {
    if (!product.categ_id) return false;
    return product.categ_id[1].toLowerCase().includes(category.name.toLowerCase());
  }) ?? getFeaturedProduct(products);
}

function EmpaquesHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 text-[#9CBB06] shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo-imprima-horizontal.png"
              alt="Imprima"
              width={198}
              height={79}
              priority
              className="h-10 w-auto"
            />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href="/#categorias">Soluciones</Link>
            <Link className="border-b-2 border-[#9CBB06] px-3 py-2 font-black text-[#9CBB06]" href="/empaques">Empaques</Link>
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href="#ventajas">Sostenibilidad</Link>
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href="#cotizar">Servicios</Link>
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href="/contacto">Contacto</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="#catalogo" aria-label="Buscar en catálogo" className="hidden text-zinc-600 transition hover:text-[#9CBB06] sm:inline-flex">
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href="#cotizar"
            className="hidden rounded-full bg-[#9CBB06] px-6 py-2.5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-[#8cab05] md:inline-flex"
          >
            Cotizar Ahora
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-[#9CBB06] hover:text-slate-950"
          >
            <Building2 className="h-4 w-4" />
            B2B
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection({ data, highlights }: { data: EmpaquesCatalogData; highlights: EmpaquesCatalogData | null }) {
  const highlightedProducts = highlights?.productos.length ? highlights.productos : data.productos;
  const featuredProduct = getFeaturedProduct(highlightedProducts);
  const imageSrc = featuredProduct ? getProductImageSrc(featuredProduct) : null;

  return (
    <section className="relative flex min-h-[760px] items-center overflow-hidden bg-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_40%,rgba(255,255,255,0.92),rgba(255,255,255,0.12)_32%,transparent_50%),linear-gradient(105deg,#F8F8F5_0%,#F8F8F5_42%,#fecaca_68%,#ef4444_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#F8F8F5]/95 via-[#F8F8F5]/80 to-transparent" />
      {imageSrc && (
        <div className="absolute right-[-8%] top-24 hidden h-[560px] w-[560px] items-center justify-center rounded-full bg-white/30 p-16 backdrop-blur-sm lg:flex">
          <Image
            src={imageSrc}
            alt={featuredProduct?.name ?? 'Producto de Empaques Imprima'}
            width={460}
            height={460}
            unoptimized
            priority
            className="max-h-full w-auto object-contain drop-shadow-2xl"
          />
        </div>
      )}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="max-w-2xl space-y-8">
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-slate-950 md:text-7xl">
            Soluciones de Empaque que <span className="text-[#9CBB06]">Impulsan tu Marca</span>
          </h1>
          <p className="max-w-xl text-xl font-bold leading-relaxed text-slate-600">
            Diseño estratégico, sostenibilidad y producción a escala para empresas que exigen calidad premium en cada entrega.
          </p>
          <div className="flex flex-col gap-4 pt-2 sm:flex-row">
            <Link
              href="#catalogo"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#9CBB06] px-8 py-4 text-lg font-black text-slate-950 shadow-lg shadow-[#9CBB06]/20 transition hover:bg-[#8cab05]"
            >
              Ver Catálogo Corporativo
              <ArrowRight className="h-5 w-5" />
            </Link>
            <LeadButton
              fuente="empaques_hero"
              texto="Hablar con un Asesor"
              variant="outline"
              hideIcon
              className="justify-center rounded-full border border-slate-300 bg-white px-8 py-4 text-lg font-black text-slate-950 hover:bg-slate-50"
              mensajePrefill="Estoy interesado en soluciones de empaque para mi empresa."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryCard({
  category,
  product,
  variant,
}: {
  category: EmpaquesCategoryNode;
  product: EmpaquesCatalogProduct | null;
  variant: 'wide' | 'tall' | 'dark';
}) {
  const imageSrc = product ? getProductImageSrc(product) : null;
  const isTall = variant === 'tall';
  const isDark = variant === 'dark';

  return (
    <Link
      href={buildCategoryHref(category.id, '')}
      className={`group relative overflow-hidden rounded-2xl bg-slate-900 shadow-sm transition hover:shadow-md ${isTall ? 'md:col-span-1 md:row-span-2' : 'md:col-span-2 md:row-span-1'}`}
    >
      <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-950' : 'bg-gradient-to-br from-emerald-900 via-teal-800 to-slate-950'}`} />
      {imageSrc && (
        <Image
          src={imageSrc}
          alt={product?.name ?? category.name}
          width={520}
          height={520}
          unoptimized
          className={`absolute inset-0 h-full w-full object-cover opacity-60 transition duration-700 group-hover:scale-105 ${isTall ? 'object-center' : 'object-right'}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full p-8">
        {!isTall && (
          <span className="mb-3 inline-block rounded-full bg-[#9CBB06] px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
            {category.children.length > 0 ? `${category.children.length} subcategorías` : 'Línea activa'}
          </span>
        )}
        <h4 className="text-3xl font-black text-white">{category.name}</h4>
        <p className="mt-2 max-w-md text-sm font-bold leading-6 text-white/80">{category.complete_name}</p>
        {isTall && (
          <span className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition group-hover:bg-[#9CBB06] group-hover:text-slate-950">
            <ArrowRight className="h-5 w-5" />
          </span>
        )}
      </div>
    </Link>
  );
}

function CategoriesSection({ data, highlights }: { data: EmpaquesCatalogData; highlights: EmpaquesCatalogData | null }) {
  const highlightedProducts = highlights?.productos.length ? highlights.productos : data.productos;
  const featuredCategories = [
    ...data.categories,
    ...data.categories.flatMap((category) => category.children),
  ].slice(0, 3);

  if (featuredCategories.length === 0) return null;

  return (
    <section id="catalogo" className="bg-[#F8F8F5] px-4 py-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl space-y-4 text-center">
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-[#9CBB06]">Nuestras Líneas</h2>
          <h3 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Categorías de Empaques</h3>
        </div>
        <div className="grid auto-rows-[360px] grid-cols-1 gap-6 md:grid-cols-3">
          {featuredCategories.map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              product={getCategoryProduct(highlightedProducts, category)}
              variant={index === 1 ? 'tall' : index === 2 ? 'dark' : 'wide'}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  const benefits = [
    {
      icon: Sparkles,
      title: 'Personalización Total',
      text: 'Desde dimensiones exactas hasta acabados especiales para que el empaque responda a tu producto y operación.',
    },
    {
      icon: Leaf,
      title: 'Compromiso Sostenible',
      text: 'Alternativas y materiales pensados para reducir impacto sin comprometer presentación ni resistencia.',
    },
    {
      icon: Route,
      title: 'Logística Nacional Optimizada',
      text: 'Acompañamiento comercial para abastecer necesidades recurrentes, proyectos especiales y operación nacional.',
    },
  ];

  return (
    <section id="ventajas" className="relative overflow-hidden bg-[#F1F1EE] px-4 py-28 sm:px-6 lg:px-8">
      <div className="absolute right-0 top-0 h-[520px] w-[520px] translate-x-1/3 -translate-y-1/2 rounded-full bg-[#9CBB06]/10 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-[420px] w-[420px] -translate-x-1/4 translate-y-1/3 rounded-full bg-slate-300/30 blur-3xl" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-14 md:flex-row md:items-center">
        <div className="w-full space-y-6 md:w-1/3">
          <h2 className="text-sm font-black uppercase tracking-[0.24em] text-[#9CBB06]">Ventaja Competitiva</h2>
          <h3 className="text-4xl font-black leading-tight tracking-tight text-slate-950 md:text-5xl">
            Por qué elegir <br />Imprima B2B
          </h3>
          <p className="text-lg font-bold leading-8 text-slate-600">
            Desarrollamos sistemas de empaque que optimizan tu cadena de suministro y elevan la percepción de tu marca.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:w-2/3">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.title} className={`rounded-2xl border border-white/50 bg-white/80 p-8 shadow-sm backdrop-blur-xl transition hover:shadow-md ${index === 2 ? 'sm:col-span-2' : ''}`}>
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#D9E997]">
                  <Icon className="h-7 w-7 text-[#9CBB06]" />
                </div>
                <h4 className="text-xl font-black text-slate-950">{benefit.title}</h4>
                <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{benefit.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ product }: { product: EmpaquesCatalogProduct }) {
  const imageSrc = getProductImageSrc(product);

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10">
      <div className="relative flex aspect-square items-center justify-center bg-[#F1F1EE] p-6">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={product.name}
            width={180}
            height={180}
            unoptimized
            className="max-h-full w-auto object-contain transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#D9E997] text-slate-800">
            <Package className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          {product.default_code && (
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{product.default_code}</p>
          )}
          <h3 className="line-clamp-2 min-h-14 text-base font-black leading-tight text-slate-950">{product.name}</h3>
          {product.categ_id && (
            <p className="line-clamp-1 text-xs font-bold text-slate-500">{product.categ_id[1]}</p>
          )}
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Precio</p>
            {product.price === null ? (
              <p className="text-sm font-black text-amber-700">Pendiente manual</p>
            ) : (
              <p className="text-xl font-black text-slate-950">{currencyFormatter.format(product.price)}</p>
            )}
          </div>
          <span className="rounded-full bg-[#D9E997] px-3 py-1 text-xs font-black text-slate-950">
            {product.requiere_precio_manual ? 'Cotizar' : 'Disponible'}
          </span>
        </div>
      </div>
    </article>
  );
}

function CatalogProductsSection({ data, search, categoryId, page }: { data: EmpaquesCatalogData; search: string; categoryId: number | null; page: number }) {
  const categoryOptions = [
    ...data.categories,
    ...data.categories.flatMap((category) => category.children),
  ];

  return (
    <section className="bg-white px-4 py-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.24em] text-[#9CBB06]">Catálogo real</h2>
            <h3 className="mt-3 text-4xl font-black tracking-tight text-slate-950">Productos disponibles</h3>
            <p className="mt-3 font-bold text-slate-600">
              {data.searchTooShort
                ? `Escribe mínimo ${data.minSearchLength} caracteres para buscar.`
                : `${data.total} productos encontrados.`}
            </p>
          </div>
          <form action="/empaques" className="flex w-full max-w-xl gap-2">
            {categoryId && <input type="hidden" name="categoria" value={categoryId} />}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={search}
                placeholder="Buscar cajas, bolsas, vasos..."
                className="h-12 w-full rounded-full border border-slate-200 bg-[#F8F8F5] pl-11 pr-4 text-sm font-bold text-slate-950 outline-none transition focus:border-[#9CBB06] focus:bg-white"
              />
            </div>
            <button className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800" type="submit">
              Buscar
            </button>
          </form>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={buildCategoryHref(null, search)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black transition ${
              !categoryId
                ? 'border-[#9CBB06] bg-[#9CBB06] text-slate-950 shadow-sm shadow-[#9CBB06]/20'
                : 'border-slate-200 bg-white text-slate-700 hover:border-[#9CBB06]/50 hover:text-slate-950'
            }`}
          >
            Todas
          </Link>
          {categoryOptions.slice(0, 14).map((category) => (
            <Link
              key={category.id}
              href={buildCategoryHref(category.id, search)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black transition ${
                categoryId === category.id
                  ? 'border-[#9CBB06] bg-[#9CBB06] text-slate-950 shadow-sm shadow-[#9CBB06]/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#9CBB06]/50 hover:text-slate-950'
              }`}
            >
              {category.name}
            </Link>
          ))}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.productos.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {data.productos.length === 0 && (
          <div className="mt-10 rounded-3xl border border-slate-200 bg-[#F8F8F5] p-10 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-4 text-xl font-black text-slate-950">No encontramos productos</h3>
            <p className="mt-2 font-bold text-slate-600">Prueba con otra búsqueda o categoría.</p>
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-3">
            {page > 1 && (
              <Link
                href={`/empaques?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(categoryId ? { categoria: String(categoryId) } : {}), page: String(page - 1) }).toString()}`}
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-[#9CBB06]/50"
              >
                Anterior
              </Link>
            )}
            <span className="rounded-full bg-[#F1F1EE] px-5 py-3 text-sm font-black text-slate-600">
              Página {page} de {data.totalPages}
            </span>
            {page < data.totalPages && (
              <Link
                href={`/empaques?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(categoryId ? { categoria: String(categoryId) } : {}), page: String(page + 1) }).toString()}`}
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-[#9CBB06]/50"
              >
                Siguiente
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function QuoteSection({ data }: { data: EmpaquesCatalogData }) {
  const categoryOptions = [
    ...data.categories,
    ...data.categories.flatMap((category) => category.children),
  ].map((category) => category.name);

  return (
    <section id="cotizar" className="bg-[#F8F8F5] px-4 py-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:flex">
        <div className="relative flex w-full flex-col justify-between overflow-hidden bg-[#9CBB06] p-10 text-slate-950 md:w-2/5 lg:p-12">
          <div className="absolute inset-0 opacity-10 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:40px_40px]" />
          <div className="relative z-10">
            <h3 className="text-3xl font-black tracking-tight">Proyectos Especiales</h3>
            <p className="mt-4 text-sm font-bold leading-7 text-slate-950/80">
              Cuéntanos sobre tus requerimientos de volumen y especificaciones técnicas. Un asesor especializado te contactará.
            </p>
          </div>
        </div>
        <div className="w-full p-8 md:w-3/5 lg:p-12">
          <EmpaquesQuoteForm categoryOptions={categoryOptions} />
        </div>
      </div>
    </section>
  );
}

function EmpaquesFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 px-4 py-16 text-sm sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:grid-cols-4">
        <div className="space-y-4">
          <Image src="/logo-imprima-horizontal.png" alt="Imprima" width={198} height={79} className="h-10 w-auto" />
          <p className="font-semibold leading-7 text-zinc-500">
            Soluciones integrales de empaque para empresas que buscan excelencia, sostenibilidad y eficiencia.
          </p>
        </div>
        <div>
          <h5 className="mb-4 text-xs font-black uppercase tracking-wider text-zinc-950">Divisiones</h5>
          <ul className="space-y-3 font-semibold text-zinc-500">
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="#catalogo">Empaques Industriales</Link></li>
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="/catalogo">Catálogo corporativo</Link></li>
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="/contacto">Contacto comercial</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="mb-4 text-xs font-black uppercase tracking-wider text-zinc-950">Legal</h5>
          <ul className="space-y-3 font-semibold text-zinc-500">
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="/privacidad">Aviso de Privacidad</Link></li>
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="/terminos">Términos de Servicio</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="mb-4 text-xs font-black uppercase tracking-wider text-zinc-950">Contacto</h5>
          <ul className="space-y-3 font-semibold text-zinc-500">
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="#cotizar">Soporte Técnico</Link></li>
            <li><Link className="hover:text-[#9CBB06] hover:underline" href="/contacto">Comerciales</Link></li>
          </ul>
        </div>
        <div className="border-t border-slate-200 pt-8 text-zinc-500 md:col-span-4">
          © 2026 Imprima. Líderes en soluciones de empaque B2B.
        </div>
      </div>
    </footer>
  );
}

function ConfigurationPending({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#F8F8F5] text-slate-950">
      <EmpaquesHeader />
      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-black text-slate-950">Empaques está pendiente de configuración</h1>
          <p className="mt-3 font-bold text-slate-600">{message}</p>
        </div>
      </section>
      <EmpaquesFooter />
    </div>
  );
}

function MaintenanceMode({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#F8F8F5] text-slate-950">
      <EmpaquesHeader />
      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-black text-slate-950">Empaques está en mantenimiento</h1>
          <p className="mt-3 font-bold text-slate-600">{message}</p>
          <Link
            href="/contacto"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-[#9CBB06] px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-[#8cab05]"
          >
            Contactar a un asesor
          </Link>
        </div>
      </section>
      <EmpaquesFooter />
    </div>
  );
}

type EmpaquesLoadResult =
  | { ok: true; data: EmpaquesCatalogData; highlights: EmpaquesCatalogData | null }
  | { ok: false; configurationError: string };

async function loadEmpaquesData(search: string, categoryId: number | null, page: number): Promise<EmpaquesLoadResult> {
  try {
    if (categoryId === EMPAQUES_FEATURED_CATEGORY_ID) {
      const data = await getEmpaquesCatalogData({ search, categoryId, page, limit: EMPAQUES_DEFAULT_LIMIT });
      return { ok: true, data, highlights: data };
    }

    const [data, highlights] = await Promise.all([
      getEmpaquesCatalogData({ search, categoryId, page, limit: EMPAQUES_DEFAULT_LIMIT }),
      getEmpaquesCatalogData({ categoryId: EMPAQUES_FEATURED_CATEGORY_ID, page: 1, limit: 8 }),
    ]);

    return { ok: true, data, highlights };
  } catch (error) {
    if (error instanceof EmpaquesConfigurationError) {
      return { ok: false, configurationError: error.message };
    }

    throw error;
  }
}

function EmpaquesContent({
  data,
  highlights,
  search,
  categoryId,
  page,
}: {
  data: EmpaquesCatalogData;
  highlights: EmpaquesCatalogData | null;
  search: string;
  categoryId: number | null;
  page: number;
}) {
  return (
    <div className="min-h-screen bg-[#F8F8F5] text-slate-950 antialiased">
      <EmpaquesHeader />
      <main>
        <HeroSection data={data} highlights={highlights} />
        <CategoriesSection data={data} highlights={highlights} />
        <BenefitsSection />
        <CatalogProductsSection data={data} search={search} categoryId={categoryId} page={page} />
        <QuoteSection data={data} />
      </main>
      <EmpaquesFooter />
    </div>
  );
}

export default async function EmpaquesPage({ searchParams }: EmpaquesPageProps) {
  const availability = await getEmpaquesPublicAvailability();

  if (!availability.enabled) {
    return <MaintenanceMode message="Estamos preparando el nuevo catálogo de Empaques. Pronto estará disponible." />;
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = getSingleSearchParam(resolvedSearchParams?.q).trim();
  const categoryId = parsePositiveInteger(getSingleSearchParam(resolvedSearchParams?.categoria));
  const page = parsePositiveInteger(getSingleSearchParam(resolvedSearchParams?.page)) ?? 1;
  const result = await loadEmpaquesData(search, categoryId, page);

  if (result.ok) {
    return <EmpaquesContent data={result.data} highlights={result.highlights} search={search} categoryId={categoryId} page={page} />;
  }

  return <ConfigurationPending message={result.configurationError} />;
}
