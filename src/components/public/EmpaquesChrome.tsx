import Image from 'next/image';
import Link from 'next/link';
import { Building2, Search } from 'lucide-react';

type EmpaquesChromeProps = {
  sectionBasePath?: string;
};

function sectionHref(sectionBasePath: string, section: string) {
  return `${sectionBasePath}#${section}`;
}

export function EmpaquesHeader({ sectionBasePath = '' }: EmpaquesChromeProps) {
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
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href={sectionHref(sectionBasePath, 'ventajas')}>Sostenibilidad</Link>
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href={sectionHref(sectionBasePath, 'cotizar')}>Servicios</Link>
            <Link className="rounded px-3 py-2 font-bold text-zinc-600 transition hover:bg-zinc-50 hover:text-[#9CBB06]" href="/contacto">Contacto</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href={sectionHref(sectionBasePath, 'catalogo')} aria-label="Buscar en catálogo" className="hidden text-zinc-600 transition hover:text-[#9CBB06] sm:inline-flex">
            <Search className="h-5 w-5" />
          </Link>
          <Link
            href={sectionHref(sectionBasePath, 'cotizar')}
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

export function EmpaquesFooter({ sectionBasePath = '' }: EmpaquesChromeProps) {
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
            <li><Link className="hover:text-[#9CBB06] hover:underline" href={sectionHref(sectionBasePath, 'catalogo')}>Empaques Industriales</Link></li>
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
            <li><Link className="hover:text-[#9CBB06] hover:underline" href={sectionHref(sectionBasePath, 'cotizar')}>Soporte Técnico</Link></li>
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
