import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileLock2, Palette, Ruler } from 'lucide-react';
import { EmpaquesFooter, EmpaquesHeader } from '@/components/public/EmpaquesChrome';
import EmpaquesPersonalizadosForm from '@/components/public/EmpaquesPersonalizadosForm';
import { getEmpaquesLandingConfig } from '@/lib/empaques/landing-config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const config = (await getEmpaquesLandingConfig()).personalizados;
  return {
    title: `${config.titulo} | Imprima`,
    description: config.subtitulo.slice(0, 160),
    openGraph: {
      title: config.titulo,
      description: config.subtitulo.slice(0, 160),
      images: config.imagen_url ? [{ url: config.imagen_url, alt: config.titulo }] : undefined,
    },
  };
}

export default async function EmpaquesPersonalizadosPage() {
  const config = (await getEmpaquesLandingConfig()).personalizados;
  if (!config.activo) notFound();

  const requestHeaders = await headers();
  const isEmpaquesSubdomain = (requestHeaders.get('host') || '').startsWith('empaques.');
  const homeHref = isEmpaquesSubdomain ? '/' : '/empaques';

  return (
    <div className="min-h-screen bg-[#F8F8F5] text-slate-950 antialiased">
      <EmpaquesHeader sectionBasePath={homeHref} personalizedHref={isEmpaquesSubdomain ? '/personalizados' : '/empaques/personalizados'} />
      <main>
        <section className="relative overflow-hidden bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28">
          {config.imagen_url ? (
            <>
              <Image src={config.imagen_url} alt="" fill sizes="100vw" unoptimized priority className="object-cover opacity-45" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-950/40" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_30%,rgba(156,187,6,0.28),transparent_38%),linear-gradient(120deg,#020617,#172033)]" />
          )}
          <div className="relative mx-auto max-w-7xl">
            <Link href={homeHref} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/80 transition hover:border-[#9CBB06] hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Volver a Empaques
            </Link>
            <div className="mt-10 max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.24em] text-[#C9DE70]">{config.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-7xl">{config.titulo}</h1>
              <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/80">{config.subtitulo}</p>
              <a href="#configurador" className="mt-8 inline-flex min-h-14 items-center justify-center rounded-full bg-[#9CBB06] px-8 py-4 text-lg font-black text-slate-950 transition hover:bg-[#8cab05]">
                {config.cta_texto}
              </a>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
            {[
              { icon: Ruler, title: 'Producto y medidas', text: 'Registra el uso, dimensiones y cantidad estimada del proyecto.' },
              { icon: Palette, title: 'Material e impresión', text: 'Define las preferencias disponibles o déjalas para asesoría técnica.' },
              { icon: FileLock2, title: 'Archivos protegidos', text: 'Los artes, logos y referencias se almacenan de forma privada.' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D9E997]">
                  <item.icon className="h-6 w-6 text-slate-800" />
                </div>
                <h2 className="mt-5 text-xl font-black text-slate-950">{item.title}</h2>
                <p className="mt-2 font-semibold leading-7 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="configurador" className="scroll-mt-24 px-4 pb-28 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-start">
            <div className="rounded-3xl bg-[#9CBB06] p-8 text-slate-950 lg:sticky lg:top-28 lg:p-10">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-950/60">Proyecto personalizado</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight">Cuéntanos qué necesitas</h2>
              <p className="mt-5 font-semibold leading-8 text-slate-950/75">{config.descripcion}</p>
              <p className="mt-6 text-sm font-bold leading-6 text-slate-950/70">
                El envío no genera un precio automático ni una orden en Odoo. Nuestro equipo revisará la viabilidad técnica y preparará la propuesta comercial.
              </p>
            </div>
            <EmpaquesPersonalizadosForm config={config} />
          </div>
        </section>
      </main>
      <EmpaquesFooter sectionBasePath={homeHref} personalizedHref={isEmpaquesSubdomain ? '/personalizados' : '/empaques/personalizados'} />
    </div>
  );
}
