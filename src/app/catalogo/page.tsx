'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Package, ArrowRight, Phone, Building2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface ProductoPublico {
  id: number;
  name: string;
  categ_id: [number, string];
  image_128: string | false;
  default_code: string | false;
  uom_name: string;
}

const MIN_SEARCH_LENGTH = 3;
const DEBOUNCE_MS = 400;
const RESULTS_LIMIT = 50;

export default function CatalogoPublicoPage() {
  const [productos, setProductos] = useState<ProductoPublico[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchProductos = useCallback(async (term: string) => {
    setSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        search: term,
        limit: String(RESULTS_LIMIT),
      });

      const res = await fetch(`/api/odoo/productos?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error buscando productos');

      setProductos(data.productos || []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de búsqueda');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = busqueda.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setProductos([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void searchProductos(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busqueda, searchProductos]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f8f5] text-slate-900 antialiased font-display">
      {/* ───── Header (idéntico al landing) ───── */}
      <header className="sticky top-0 z-50 bg-[#f8f8f5]/80 backdrop-blur-md border-b border-primary/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center">
                <img src="/logo-imprima-horizontal.png" alt="Imprima" className="h-10 w-auto" />
              </Link>
              <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
                <Link className="hover:text-primary transition-colors" href="/#categorias">Categorías</Link>
                <Link className="text-primary font-bold" href="/catalogo">Catálogo</Link>
                <Link className="hover:text-primary transition-colors" href="/#testimonios">Testimonios</Link>
                <Link className="hover:text-primary transition-colors" href="/#contacto">Contacto</Link>
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
        {/* ───── Hero buscador ───── */}
        <section className="pt-16 pb-12 lg:pt-24 lg:pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              Más de 10.000 productos
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6">
              Catálogo de Productos
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              Explore nuestro portafolio completo de suministros corporativos.
              Papelería, aseo, cafetería, dotación y mucho más.
            </p>

            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o referencia del producto..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full pl-14 pr-5 py-4 bg-white border border-slate-200 rounded-2xl text-base shadow-lg shadow-slate-900/5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-5 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {busqueda.trim().length > 0 && busqueda.trim().length < MIN_SEARCH_LENGTH && (
                <p className="text-sm text-slate-500 mt-3">
                  Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Error */}
            {error && (
              <div className="max-w-2xl mx-auto mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Estado vacío inicial */}
            {!searched && !searching && !error && (
              <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center max-w-3xl mx-auto shadow-sm">
                <Search className="w-16 h-16 text-slate-200 mx-auto mb-5" />
                <h2 className="text-2xl font-extrabold text-slate-800 mb-3">
                  ¿Qué producto necesita?
                </h2>
                <p className="text-slate-500 max-w-md mx-auto mb-10 leading-relaxed">
                  Escriba el nombre del producto que busca. Por ejemplo: &ldquo;papel&rdquo;, &ldquo;tóner&rdquo;, &ldquo;guantes&rdquo; o &ldquo;café&rdquo;.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/login"
                    className="bg-primary hover:bg-primary/90 text-slate-900 px-8 py-3.5 rounded-xl font-bold transition-all shadow-xl shadow-primary/20 flex items-center gap-2"
                  >
                    Regístrese para comprar
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/contacto"
                    className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    Contactar un asesor
                  </Link>
                </div>
              </div>
            )}

            {/* Sin resultados */}
            {searched && !searching && productos.length === 0 && !error && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-2xl mx-auto shadow-sm">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-800 font-semibold text-lg">
                  No se encontraron productos para &ldquo;{busqueda}&rdquo;
                </p>
                <p className="text-slate-500 text-sm mt-2 mb-6">
                  Intente con otro nombre o referencia
                </p>
                <Link
                  href="/contacto"
                  className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-bold text-sm transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  ¿No encuentra lo que busca? Contáctenos
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {/* Resultados */}
            {productos.length > 0 && (
              <>
                <p className="text-sm text-slate-500 mb-6">
                  {productos.length >= RESULTS_LIMIT
                    ? `Mostrando los primeros ${RESULTS_LIMIT} resultados. Refine su búsqueda para encontrar algo específico.`
                    : `${productos.length} producto${productos.length !== 1 ? 's' : ''} encontrado${productos.length !== 1 ? 's' : ''}`}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {productos.map((producto) => {
                    const categoriaLabel = Array.isArray(producto.categ_id) ? producto.categ_id[1] : '';

                    return (
                      <div
                        key={producto.id}
                        className="bg-white rounded-2xl border border-slate-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all overflow-hidden"
                      >
                        <div className="w-full h-36 bg-slate-50 flex items-center justify-center">
                          {producto.image_128 ? (
                            <img
                              src={`data:image/png;base64,${producto.image_128}`}
                              alt={producto.name}
                              className="h-full w-full object-contain p-3"
                            />
                          ) : (
                            <Package className="w-10 h-10 text-slate-200" />
                          )}
                        </div>

                        <div className="p-4">
                          {categoriaLabel && (
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              {categoriaLabel}
                            </span>
                          )}

                          {typeof producto.default_code === 'string' && producto.default_code && (
                            <p className="text-[10px] text-slate-400 mt-2 font-mono">Ref: {producto.default_code}</p>
                          )}

                          <h3 className="text-sm font-semibold text-slate-800 mt-1 line-clamp-2 min-h-[2.5rem]">
                            {producto.name}
                          </h3>

                          <p className="text-xs text-slate-400 mt-1">
                            {producto.uom_name || 'und'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CTA después de resultados */}
                <div className="mt-16 bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
                  <h3 className="text-2xl font-extrabold text-slate-900 mb-3">
                    ¿Interesado en estos productos?
                  </h3>
                  <p className="text-slate-600 mb-8 max-w-lg mx-auto leading-relaxed">
                    Regístrese en nuestra plataforma B2B para acceder a precios corporativos, realizar pedidos y gestionar sus compras de forma eficiente.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                      href="/login"
                      className="bg-primary hover:bg-primary/90 text-slate-900 px-8 py-3.5 rounded-xl font-bold transition-all shadow-xl shadow-primary/20 flex items-center gap-2"
                    >
                      Registrar mi empresa
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href="/contacto"
                      className="bg-slate-900 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                      <Phone className="w-4 h-4" />
                      Hablar con un asesor
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {/* ───── Footer (consistente con landing) ───── */}
      <footer className="bg-slate-50 pt-12 pb-8 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div>
              <img src="/logo-imprima-horizontal.png" alt="Imprima" className="h-8 w-auto" />
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
              <Link href="/catalogo" className="text-primary font-semibold">Catálogo</Link>
              <Link href="/#contacto" className="hover:text-primary transition-colors">Contacto</Link>
              <Link href="/login" className="hover:text-primary transition-colors">Acceso B2B</Link>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-200 text-center text-sm text-slate-400">
            <p>&copy; {new Date().getFullYear()} Imprima S.A.S. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
