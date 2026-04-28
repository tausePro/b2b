import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PenLine, ShieldCheck, Coffee, Award, RefreshCw,
  BarChart3, HeadphonesIcon, Star, ChevronRight,
  Building2, Package,
} from 'lucide-react';
import LeadButton from '@/components/public/LeadButton';
import WhatsAppBubble from '@/components/public/WhatsAppBubble';
import HeroHome from '@/components/public/HeroHome';
import {
  getSeccion,
  getSeccionesActivas,
  type LandingSeccion,
} from '@/lib/landing/getContenido';
import { getPublicCatalogRootCategories } from '@/lib/catalogoPublico';
import { getHeroDynamicStats } from '@/lib/home/getHeroDynamicStats';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await getSeccion('seo');
    if (seo) {
      const c = seo.contenido || {};
      return {
        title: seo.titulo || 'Imprima | Suministros Corporativos B2B',
        description: seo.subtitulo || 'Soluciones integrales de suministros para el sector corporativo en Colombia.',
        openGraph: {
          title: (c.og_title as string) || seo.titulo || undefined,
          description: (c.og_description as string) || seo.subtitulo || undefined,
          images: (c.og_image as string) ? [{ url: c.og_image as string }] : undefined,
        },
        robots: (c.robots as string) || 'index, follow',
        alternates: { canonical: (c.canonical_url as string) || undefined },
      };
    }
  } catch {}
  return {
    title: 'Imprima | Suministros Corporativos B2B',
    description: 'Soluciones integrales de suministros para el sector corporativo en Colombia.',
  };
}

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 300;

const iconMap: Record<string, React.ReactNode> = {
  edit_note: <PenLine className="w-6 h-6" />,
  sanitizer: <ShieldCheck className="w-6 h-6" />,
  coffee: <Coffee className="w-6 h-6" />,
  loyalty: <Award className="w-6 h-6" />,
  sync: <RefreshCw className="w-5 h-5" />,
  analytics: <BarChart3 className="w-5 h-5" />,
  live_help: <HeadphonesIcon className="w-5 h-5" />,
};

const categoryColors = [
  'from-primary/30 to-primary/5',
  'from-emerald-200/40 to-emerald-50/20',
  'from-amber-200/40 to-amber-50/20',
  'from-violet-200/40 to-violet-50/20',
];

async function getContenido(): Promise<Record<string, LandingSeccion>> {
  try {
    return await getSeccionesActivas();
  } catch {
    return {};
  }
}

// Mapea ids de product.category → { name, slug } usando la misma lista filtrada
// que ve el cliente B2B en /catalogo. Si Odoo falla, retornamos un map vacío
// para que las tarjetas caigan en el fallback legacy sin reventar la landing.
async function getCategoriasMap(): Promise<
  Map<number, { id: number; name: string; slug: string }>
> {
  try {
    const roots = await getPublicCatalogRootCategories();
    return new Map(roots.map((c) => [c.id, { id: c.id, name: c.name, slug: c.slug }]));
  } catch {
    return new Map();
  }
}

function buildJsonLd(seo: LandingSeccion | undefined, faqs: Array<{ pregunta: string; respuesta: string }>) {
  const schemas: Record<string, unknown>[] = [];
  if (seo) {
    const org = (seo.contenido.organization || {}) as Record<string, unknown>;
    const addr = (org.address || {}) as Record<string, string>;
    if (org.name) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: org.name,
        url: org.url || undefined,
        logo: org.logo || undefined,
        telephone: org.telephone || undefined,
        email: org.email || undefined,
        address: addr.streetAddress ? {
          '@type': 'PostalAddress',
          streetAddress: addr.streetAddress,
          addressLocality: addr.addressLocality,
          addressRegion: addr.addressRegion,
          postalCode: addr.postalCode,
          addressCountry: addr.addressCountry,
        } : undefined,
      });
    }
  }
  if (faqs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: f.respuesta },
      })),
    });
  }
  return schemas;
}

export default async function LandingPage() {
  const [c, categoriasMap, heroDynamicStats] = await Promise.all([
    getContenido(),
    getCategoriasMap(),
    getHeroDynamicStats(),
  ]);
  const hero = c.hero;
  const cats = c.categorias;
  const efi = c.eficiencia;
  const cli = c.clientes;
  const testi = c.testimonios;
  const cta = c.cta;
  const foot = c.footer;
  const seo = c.seo;

  const faqs = (seo?.contenido?.faqs || []) as Array<{ pregunta: string; respuesta: string }>;
  const jsonLdSchemas = buildJsonLd(seo, faqs);

  // Shape extendido: si `categoria_id` existe, título/slug se resuelven desde Odoo;
  // si no, se usan los campos legacy (titulo/icono) como texto libre.
  const catItems = (cats?.contenido?.items ?? []) as Array<{
    categoria_id?: number;
    titulo?: string;
    descripcion?: string;
    icono?: string;
    imagen_url: string | null;
  }>;
  const efiItems = (efi?.contenido?.items ?? []) as Array<{ titulo: string; descripcion: string; icono: string }>;
  const testiItems = (testi?.contenido?.items ?? []) as Array<{ nombre: string; cargo: string; empresa: string; texto: string; estrellas: number }>;
  const footColumnas = (foot?.contenido?.columnas ?? []) as Array<{ titulo: string; links: Array<{ texto: string; url: string }> }>;
  const clienteLogos = (cli?.contenido?.logos ?? []) as Array<{ nombre: string; logo_url?: string }>;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f8f5] text-slate-900 antialiased font-display">
      {/* ───── JSON-LD Schemas ───── */}
      {jsonLdSchemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      {/* ───── Header ─────
          Glass reforzado (v1.25.0): backdrop-blur-xl + bg translucido con
          saturacion, borde inferior con tinte primary sutil y shadow que
          se vuelve visible cuando ya no estamos al top (simulado con
          ring). El spacer adicional garantiza que el sticky no se
          superponga con el halo del hero. */}
      <header className="sticky top-0 z-50 backdrop-blur-xl backdrop-saturate-150 bg-[#f8f8f5]/70 border-b border-primary/15 shadow-sm shadow-slate-900/[0.02]">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
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
              <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
                <a className="hover:text-primary transition-colors" href="#categorias">Categorías</a>
                <Link className="hover:text-primary transition-colors" href="/catalogo">Catálogo</Link>
                <a className="hover:text-primary transition-colors" href="#testimonios">Testimonios</a>
                {/* Contacto ahora es una pagina propia (/contacto) con
                    formulario + CTA WhatsApp; reemplaza al ancla interna
                    al bloque CTA del home, que seguia existiendo por
                    legado (#contacto). */}
                <Link className="hover:text-primary transition-colors" href="/contacto">Contacto</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/empaques"
                className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-primary/50 hover:text-slate-900"
              >
                <Package className="w-4 h-4" />
                Empaques
              </Link>
              <Link
                href="/login"
                className="bg-primary hover:bg-primary/90 text-slate-900 px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                Acceso Clientes B2B
              </Link>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* ───── Hero (redisenado v1.24.0: half-bleed asimetrico + glass) ───── */}
        <HeroHome hero={hero} dynamicStats={heroDynamicStats} />

        {/* ───── Categorías ─────
            v1.25.0: se quita bg-white solido (competia con el bg #f8f8f5
            del body y rompia el fondo glass). Ahora la seccion respira
            sobre el mismo lienzo y las tarjetas se convierten en el
            elemento visual: imagen con hover-zoom y sombra primary/10
            al hacer hover, consistente con las tarjetas de comerciales. */}
        {catItems.length > 0 && (
          <section id="categorias" className="relative py-24 overflow-hidden">
            {/* Halo decorativo primary sutil para dar profundidad */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 right-0 w-96 h-96 rounded-full bg-primary/10 blur-[100px]"
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-end mb-12">
                <div>
                  <h2 className="text-3xl font-extrabold mb-2">{cats?.titulo ?? 'Nuestras Categorías'}</h2>
                  <p className="text-slate-600">{cats?.subtitulo}</p>
                </div>
                {typeof cats?.contenido?.cta_texto === 'string' && (
                  <Link href={(cats.contenido.cta_url as string) ?? '/login'} className="text-primary font-bold flex items-center gap-1 hover:underline">
                    {cats.contenido.cta_texto} <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {catItems.map((cat, i) => {
                  // Resolución unificada: si el item viene vinculado a una
                  // categoría real (categoria_id), tomamos título/link de Odoo;
                  // si no, nos quedamos con los campos legacy para no romper
                  // contenido ya guardado en BD antes de la migración.
                  const catReal =
                    typeof cat.categoria_id === 'number'
                      ? categoriasMap.get(cat.categoria_id) ?? null
                      : null;
                  const titulo = catReal?.name ?? cat.titulo ?? '';
                  const descripcion = cat.descripcion ?? '';
                  const icono = cat.icono;
                  const href = catReal
                    ? `/catalogo?categoria=${catReal.id}`
                    : null;

                  const iconNode = icono
                    ? iconMap[icono] ?? <PenLine className="w-6 h-6" />
                    : <PenLine className="w-6 h-6" />;

                  const cardInner = (
                    <>
                      <div className="relative h-64 rounded-2xl overflow-hidden mb-4 shadow-md shadow-slate-900/5 group-hover:shadow-xl group-hover:shadow-primary/15 transition-shadow duration-300">
                        {cat.imagen_url ? (
                          <Image
                            src={cat.imagen_url}
                            alt={titulo}
                            fill
                            // sizes: en mobile ocupan 100vw, en md dos columnas
                            // (~50vw), en lg cuatro columnas (~25vw). Next usa
                            // esto para pedir el srcset mas eficiente.
                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div
                            className={`w-full h-full bg-gradient-to-br ${categoryColors[i % categoryColors.length]} flex items-center justify-center transition-transform duration-500 group-hover:scale-110`}
                          >
                            <div className="text-primary/40 scale-[2]">{iconNode}</div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-4 left-4 text-white">{iconNode}</div>
                      </div>
                      <h3 className="text-xl font-bold">{titulo}</h3>
                      {descripcion && (
                        <p className="text-slate-500 text-sm">{descripcion}</p>
                      )}
                    </>
                  );

                  return href ? (
                    <Link
                      key={i}
                      href={href}
                      className="group cursor-pointer block hover:-translate-y-1 transition-transform duration-300"
                      aria-label={`Ver catálogo de ${titulo}`}
                    >
                      {cardInner}
                    </Link>
                  ) : (
                    <div key={i} className="group">
                      {cardInner}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ───── Eficiencia Operativa ─────
            v1.25.0: container con glass (backdrop-blur) sobre bg-primary/5
            + halo decorativo primary que sangra por detras. Los items
            heredan el hover-lift sutil del lenguaje global. */}
        {efiItems.length > 0 && (
          <section id="servicios" className="relative py-24 overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-emerald-200/20 blur-[100px]"
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="relative backdrop-blur-sm bg-primary/5 rounded-3xl p-8 lg:p-16 border border-primary/20 shadow-lg shadow-primary/10 overflow-hidden">
                {/* Halo primary dentro del container para reforzar la
                    identidad del modulo sin depender solo del bg/5. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-10 -left-10 w-72 h-72 rounded-full bg-primary/20 blur-3xl"
                />
                <div className="absolute top-8 right-8 hidden lg:block">
                  <RefreshCw className="w-28 h-28 text-primary/10" />
                </div>
                <div className="max-w-3xl relative z-10">
                  <h2 className="text-4xl font-extrabold mb-6">{efi?.titulo ?? 'Eficiencia Operativa'}</h2>
                  <p className="text-lg text-slate-600 mb-10 leading-relaxed">{efi?.subtitulo}</p>
                  <div className="grid md:grid-cols-3 gap-8">
                    {efiItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-3 backdrop-blur-sm bg-white/60 border border-white/70 rounded-2xl p-5 shadow-sm hover:shadow-md hover:shadow-primary/10 hover:-translate-y-0.5 transition-all"
                      >
                        <div className="w-12 h-12 rounded-xl bg-primary text-slate-900 flex items-center justify-center shadow-sm shadow-primary/30">
                          {iconMap[item.icono] ?? <BarChart3 className="w-5 h-5" />}
                        </div>
                        <h4 className="font-bold text-lg">{item.titulo}</h4>
                        <p className="text-slate-500 text-sm">{item.descripcion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ───── Clientes que confían ───── */}
        {clienteLogos.length > 0 && (
          <section className="py-12 border-y border-slate-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-10">
                {cli?.titulo ?? 'Empresas que confían en nosotros'}
              </p>
              <div className="flex flex-wrap justify-center items-center gap-12 opacity-40 grayscale hover:grayscale-0 transition-all">
                {clienteLogos.map((logo, i) => (
                  <span key={i} className="text-2xl font-black">{logo.nombre}</span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ───── Testimonios ─────
            v1.25.0: tarjetas glass (bg-white/75 + blur) con hover lift y
            halos primary detras de cada una para romper la uniformidad y
            dar textura al scroll. */}
        {testiItems.length > 0 && (
          <section id="testimonios" className="relative py-24 overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-0 w-80 h-80 rounded-full bg-primary/10 blur-[100px]"
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
                <div className="max-w-xl">
                  <h2 className="text-4xl font-bold tracking-tight">{testi?.titulo ?? 'Voces de Confianza'}</h2>
                  <p className="mt-4 text-slate-600">{testi?.subtitulo}</p>
                </div>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {testiItems.map((t, i) => (
                  <div
                    key={i}
                    className="group relative flex flex-col gap-6 rounded-2xl backdrop-blur-md bg-white/80 p-8 shadow-md shadow-slate-900/5 border border-white/70 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex gap-1 text-primary">
                      {Array.from({ length: t.estrellas }).map((_, j) => (
                        <Star key={j} className="w-5 h-5 fill-primary" />
                      ))}
                    </div>
                    <p className="text-lg italic leading-relaxed text-slate-700">
                      &ldquo;{t.texto}&rdquo;
                    </p>
                    <div className="mt-auto flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                        {t.nombre.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold">{t.nombre}</h4>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">{t.cargo} - {t.empresa}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ───── CTA ─────
            v1.25.0: wrapper glass con halo primary grande, reforzado con
            un badge pulse (ping) para marcar el punto focal del cierre. */}
        <section id="contacto" className="relative py-24 overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-[600px] h-[600px] rounded-full bg-primary/20 blur-[140px]"
          />
          <div className="relative max-w-5xl mx-auto px-4">
            <div className="relative backdrop-blur-md bg-white/60 border border-white/70 rounded-3xl px-6 py-12 lg:px-16 lg:py-16 text-center shadow-xl shadow-primary/10">
              <h2 className="text-4xl font-extrabold mb-6">
                {cta?.titulo ?? '¿Listo para optimizar sus suministros?'}
              </h2>
              <p className="text-xl text-slate-600 mb-10">
                {cta?.subtitulo ?? 'Únase a cientos de empresas que ya automatizaron su gestión de insumos con Imprima.'}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  href={(cta?.contenido?.cta_primario_url as string) ?? '/login'}
                  className="bg-primary hover:bg-primary/90 text-slate-900 px-10 py-4 rounded-xl font-bold text-lg transition-all shadow-xl shadow-primary/20"
                >
                  {(cta?.contenido?.cta_primario as string) ?? 'Crear Cuenta Corporativa'}
                </Link>
                <LeadButton
                  fuente="landing_cta"
                  texto={(cta?.contenido?.cta_secundario as string) ?? 'Hablar con un Consultor'}
                  variant="whatsapp"
                  className="!px-10 !py-4 !text-lg"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ───── Footer ───── */}
      <footer className="bg-slate-50 pt-20 pb-10 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-2">
              <div className="mb-6">
                <Image
                  src="/logo-imprima-horizontal.png"
                  alt="Imprima"
                  width={198}
                  height={79}
                  className="h-10 w-auto"
                />
              </div>
              <p className="text-slate-500 max-w-sm mb-6 leading-relaxed">
                {foot?.subtitulo ?? 'Líderes en soluciones integrales de suministros para el sector corporativo en Colombia.'}
              </p>
            </div>
            {footColumnas.map((col, i) => (
              <div key={i}>
                <h5 className="font-bold mb-6 uppercase tracking-wider text-xs">{col.titulo}</h5>
                <ul className="space-y-4 text-slate-500">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <Link href={link.url} className="hover:text-primary transition-colors">{link.texto}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-400">
            <p>{(foot?.contenido?.copyright as string) ?? '© 2025 Imprima S.A.S. Todos los derechos reservados.'}</p>
            <div className="flex gap-6">
              <Link href="/terminos" className="hover:text-primary">Términos y Condiciones</Link>
              <Link href="/privacidad" className="hover:text-primary">Privacidad de Datos</Link>
            </div>
          </div>
        </div>
      </footer>
      <WhatsAppBubble />
    </div>
  );
}
