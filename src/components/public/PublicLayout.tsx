import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f8f8f5] text-slate-900 antialiased font-display">
      {/* ───── Header ───── */}
      <header className="sticky top-0 z-50 bg-[#f8f8f5]/80 backdrop-blur-md border-b border-primary/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center">
                <img src="/logo-imprima-horizontal.png" alt="Imprima" className="h-10 w-auto" />
              </Link>
              <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
                <Link className="hover:text-primary transition-colors" href="/#categorias">Categorías</Link>
                <Link className="hover:text-primary transition-colors" href="/catalogo">Catálogo</Link>
                <Link className="hover:text-primary transition-colors" href="/#testimonios">Testimonios</Link>
                <Link className="hover:text-primary transition-colors" href="/contacto">Contacto</Link>
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

      <main className="flex-1">{children}</main>

      {/* ───── Footer ───── */}
      <footer className="bg-slate-50 pt-12 pb-8 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div>
              <img src="/logo-imprima-horizontal.png" alt="Imprima" className="h-8 w-auto" />
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500">
              <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
              <Link href="/catalogo" className="hover:text-primary transition-colors">Catálogo</Link>
              <Link href="/nosotros" className="hover:text-primary transition-colors">Nosotros</Link>
              <Link href="/contacto" className="hover:text-primary transition-colors">Contacto</Link>
              <Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-400">
            <p>&copy; {new Date().getFullYear()} Imprima S.A.S. Todos los derechos reservados.</p>
            <div className="flex gap-6">
              <Link href="/terminos" className="hover:text-primary">Términos y Condiciones</Link>
              <Link href="/privacidad" className="hover:text-primary">Privacidad</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
