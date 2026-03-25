import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PenLine, ShieldCheck, Coffee, Award, RefreshCw,
  BarChart3, HeadphonesIcon, Star, ChevronRight,
  Building2,
} from 'lucide-react';
import LeadButton from '@/components/public/LeadButton';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: seo } = await supabase
      .from('landing_contenido')
      .select('*')
      .eq('id', 'seo')
      .single();

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

export const dynamic = 'force-dynamic';

interface LandingSeccion {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown>;
  imagen_url: string | null;
  orden: number;
  activo: boolean;
}

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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase
      .from('landing_contenido')
      .select('*')
      .eq('activo', true)
      .order('orden');
    const mapa: Record<string, LandingSeccion> = {};
    for (const item of data || []) mapa[item.id] = item;
    return mapa;
  } catch {
    return {};
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
  const c = await getContenido();
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

  const catItems = (cats?.contenido?.items ?? []) as Array<{ titulo: string; descripcion: string; icono: string; imagen_url: string | null }>;
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

      {/* ───── Header ───── */}
      <header className="sticky top-0 z-50 bg-[#f8f8f5]/80 backdrop-blur-md border-b border-primary/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center">
                <img src="/logo-imprima-horizontal.png" alt="Imprima" className="h-10 w-auto" />
              </Link>
              <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
                <a className="hover:text-primary transition-colors" href="#categorias">Categorías</a>
                <Link className="hover:text-primary transition-colors" href="/catalogo">Catálogo</Link>
                <a className="hover:text-primary transition-colors" href="#testimonios">Testimonios</a>
                <a className="hover:text-primary transition-colors" href="#contacto">Contacto</a>
              </div>
            </div>
            <div className="flex items-center gap-4">
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
        {/* ───── Hero ───── */}
        <section className="relative overflow-hidden pt-16 pb-24 lg:pt-32 lg:pb-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="z-10">
                {typeof hero?.contenido?.badge === 'string' && (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-6">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    {hero.contenido.badge as string}
                  </span>
                )}
                <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.1] mb-6">
                  {hero?.titulo ?? 'Simplificamos las compras de tu empresa'}
                </h1>
                <p className="text-lg text-slate-600 mb-10 max-w-xl leading-relaxed">
                  {hero?.subtitulo ?? 'Soluciones integrales de suministros para su compañía con tecnología de vanguardia.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    href={(hero?.contenido?.cta_primario_url as string) ?? '/login'}
                    className="bg-primary hover:bg-primary/90 text-slate-900 px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-xl shadow-primary/20 text-center"
                  >
                    {(hero?.contenido?.cta_primario as string) ?? 'Ver Catálogo de Productos'}
                  </Link>
                  <LeadButton
                    fuente="landing_hero"
                    texto={(hero?.contenido?.cta_secundario as string) ?? 'Hablar con un Asesor'}
                    variant="outline"
                    className="px-8 py-4 text-lg"
                  />
                </div>
              </div>
              <div className="relative hidden lg:block">
                <div className="absolute -top-20 -right-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" />
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border-8 border-white">
                  {hero?.imagen_url ? (
                    <img src={hero.imagen_url} alt="Imprima" className="w-full h-auto" />
                  ) : (
                    <div className="w-full aspect-video bg-gradient-to-br from-primary/20 via-primary/5 to-slate-100 flex items-center justify-center">
                      <svg className="w-24 h-24 text-primary/30" fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                        <path d="M24 0.757355L47.2426 24L24 47.2426L0.757355 24L24 0.757355ZM21 35.7574V12.2426L9.24264 24L21 35.7574Z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───── Categorías ───── */}
        {catItems.length > 0 && (
          <section id="categorias" className="py-24 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                {catItems.map((cat, i) => (
                  <div key={i} className="group cursor-pointer">
                    <div className="relative h-64 rounded-2xl overflow-hidden mb-4">
                      {cat.imagen_url ? (
                        <img src={cat.imagen_url} alt={cat.titulo} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${categoryColors[i % categoryColors.length]} flex items-center justify-center transition-transform duration-500 group-hover:scale-110`}>
                          <div className="text-primary/40 scale-[2]">
                            {iconMap[cat.icono] ?? <PenLine className="w-6 h-6" />}
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-4 left-4 text-white">
                        {iconMap[cat.icono] ?? <PenLine className="w-6 h-6" />}
                      </div>
                    </div>
                    <h3 className="text-xl font-bold">{cat.titulo}</h3>
                    <p className="text-slate-500 text-sm">{cat.descripcion}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ───── Eficiencia Operativa ───── */}
        {efiItems.length > 0 && (
          <section id="servicios" className="py-24 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-primary/5 rounded-3xl p-8 lg:p-16 border border-primary/20 relative">
                <div className="absolute top-8 right-8 hidden lg:block">
                  <RefreshCw className="w-28 h-28 text-primary/10" />
                </div>
                <div className="max-w-3xl relative z-10">
                  <h2 className="text-4xl font-extrabold mb-6">{efi?.titulo ?? 'Eficiencia Operativa'}</h2>
                  <p className="text-lg text-slate-600 mb-10 leading-relaxed">{efi?.subtitulo}</p>
                  <div className="grid md:grid-cols-3 gap-8">
                    {efiItems.map((item, i) => (
                      <div key={i} className="flex flex-col gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary text-slate-900 flex items-center justify-center">
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

        {/* ───── Testimonios ───── */}
        {testiItems.length > 0 && (
          <section id="testimonios" className="py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
                <div className="max-w-xl">
                  <h2 className="text-4xl font-bold tracking-tight">{testi?.titulo ?? 'Voces de Confianza'}</h2>
                  <p className="mt-4 text-slate-600">{testi?.subtitulo}</p>
                </div>
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                {testiItems.map((t, i) => (
                  <div key={i} className="flex flex-col gap-6 rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
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

        {/* ───── CTA ───── */}
        <section id="contacto" className="py-24">
          <div className="max-w-5xl mx-auto px-4 text-center">
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
                className="px-10 py-4 text-lg"
              />
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
                <img src="/logo-imprima-horizontal.png" alt="Imprima" className="h-10 w-auto" />
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
    </div>
  );
}
