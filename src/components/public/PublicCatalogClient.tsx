'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, ChevronDown, ChevronRight, Package, Search, X } from 'lucide-react';
import LeadButton from '@/components/public/LeadButton';
import type {
  PublicCatalogCategoryNode,
  PublicCatalogListingResult,
  PublicCatalogPageData,
} from '@/types/publicCatalog';

function buildParentIndex(categories: PublicCatalogCategoryNode[]) {
  const parentIndex: Record<number, number | null> = {};
  const categoryIndex: Record<number, PublicCatalogCategoryNode> = {};

  const visit = (nodes: PublicCatalogCategoryNode[]) => {
    nodes.forEach((node) => {
      parentIndex[node.id] = node.parentId;
      categoryIndex[node.id] = node;
      visit(node.children);
    });
  };

  visit(categories);

  return {
    categoryIndex,
    parentIndex,
  };
}

function getAncestorIds(categoryId: number | null, parentIndex: Record<number, number | null>) {
  const ancestors = new Set<number>();
  let current = categoryId;

  while (current) {
    ancestors.add(current);
    current = parentIndex[current] ?? null;
  }

  return ancestors;
}

function countNestedCategories(category: PublicCatalogCategoryNode): number {
  return category.children.reduce((total, child) => total + 1 + countNestedCategories(child), 0);
}

interface PublicCatalogClientProps {
  initialData: PublicCatalogPageData;
}

export default function PublicCatalogClient({ initialData }: PublicCatalogClientProps) {
  const pathname = usePathname();
  const { categories, ...initialListing } = initialData;
  const [query, setQuery] = useState(initialListing.query.search);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(initialListing.query.categoryId);
  const [page, setPage] = useState(initialListing.query.page);
  const [listing, setListing] = useState<PublicCatalogListingResult>(initialListing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { categoryIndex, parentIndex } = useMemo(() => buildParentIndex(categories), [categories]);
  const rootCategories = useMemo(() => categories, [categories]);
  const initialExpandedIds = useMemo(() => {
    const expanded = new Set<number>(rootCategories.map((category) => category.id));
    getAncestorIds(initialListing.selectedCategory?.id ?? null, parentIndex).forEach((id) => expanded.add(id));
    return expanded;
  }, [initialListing.selectedCategory?.id, parentIndex, rootCategories]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(initialExpandedIds);
  const firstRenderRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      getAncestorIds(selectedCategoryId, parentIndex).forEach((id) => next.add(id));
      return next;
    });
  }, [parentIndex, selectedCategoryId]);

  useEffect(() => {
    const params = new URLSearchParams();
    const trimmed = query.trim();

    if (trimmed) {
      params.set('q', trimmed);
    }

    if (selectedCategoryId) {
      params.set('categoria', String(selectedCategoryId));
    }

    if (page > 1) {
      params.set('page', String(page));
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [page, pathname, query, selectedCategoryId]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    abortRef.current?.abort();

    const trimmed = query.trim();
    const hasCategory = Boolean(selectedCategoryId);

    if (!trimmed && !hasCategory) {
      setLoading(false);
      setError(null);
      setListing((current) => ({
        ...current,
        query: { ...current.query, search: '', categoryId: null, page, limit: current.query.limit },
        productos: [],
        total: 0,
        totalPages: 0,
        selectedCategory: null,
        searchTooShort: false,
      }));
      return;
    }

    if (trimmed.length > 0 && trimmed.length < listing.minSearchLength && !hasCategory) {
      setLoading(false);
      setError(null);
      setListing((current) => ({
        ...current,
        query: { ...current.query, search: trimmed, categoryId: null, page, limit: current.query.limit },
        productos: [],
        total: 0,
        totalPages: 0,
        selectedCategory: null,
        searchTooShort: true,
      }));
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(listing.query.limit),
        });

        if (trimmed) {
          params.set('search', trimmed);
        }

        if (selectedCategoryId) {
          params.set('category_id', String(selectedCategoryId));
        }

        const response = await fetch(`/api/landing/catalogo?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'No se pudo cargar el catálogo');
        }

        setListing(payload as PublicCatalogListingResult);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : 'Error cargando catálogo');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [page, query, selectedCategoryId, listing.minSearchLength, listing.query.limit]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  const activeCategory = selectedCategoryId ? categoryIndex[selectedCategoryId] ?? null : null;
  const showBrowseState = !loading && !error && !query.trim() && !selectedCategoryId;
  const hasResults = listing.productos.length > 0;
  const showEmptyResults = !loading && !error && !listing.searchTooShort && !hasResults && (!!query.trim() || !!selectedCategoryId);

  const toggleExpanded = (categoryId: number) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const selectCategory = (categoryId: number | null) => {
    setSelectedCategoryId((current) => (current === categoryId ? null : categoryId));
    setPage(1);
  };

  const clearFilters = () => {
    setQuery('');
    setSelectedCategoryId(null);
    setPage(1);
    setError(null);
  };

  const renderCategoryTree = (nodes: PublicCatalogCategoryNode[]) => {
    return nodes.map((node) => {
      const isSelected = selectedCategoryId === node.id;
      const isExpanded = expandedIds.has(node.id);
      const hasChildren = node.children.length > 0;

      return (
        <li key={node.id}>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => (hasChildren ? toggleExpanded(node.id) : undefined)}
              className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition ${hasChildren ? 'hover:border-primary/40 hover:text-primary' : 'opacity-30 cursor-default'}`}
              disabled={!hasChildren}
              aria-label={hasChildren ? `Alternar ${node.name}` : `Categoría ${node.name}`}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                selectCategory(node.id);
                setExpandedIds((current) => new Set(current).add(node.id));
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-left text-sm transition ${isSelected ? 'bg-primary text-slate-900 font-semibold shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              <span className="block">{node.name}</span>
              {node.level > 0 && (
                <span className={`mt-0.5 block text-xs ${isSelected ? 'text-slate-800/80' : 'text-slate-400'}`}>
                  {node.complete_name}
                </span>
              )}
            </button>
          </div>
          {hasChildren && isExpanded && (
            <ul className="mt-2 ml-4 space-y-2 border-l border-slate-200 pl-3">
              {renderCategoryTree(node.children)}
            </ul>
          )}
        </li>
      );
    });
  };

  return (
    <>
      <section className="pt-16 pb-12 lg:pt-24 lg:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              Portafolio Imprima
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] text-slate-900 sm:text-5xl lg:text-6xl">
              Explore todo el catálogo por categorías reales o búsquelo al instante
            </h1>
            <div className="mt-10 max-w-3xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar por nombre o referencia del producto..."
                  className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-14 pr-28 text-base shadow-lg shadow-slate-900/5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setPage(1);
                    }}
                    className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-primary/40 hover:text-primary"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500">
                <span>Puede buscar por ejemplo: papel, tóner, guantes, café.</span>
                {activeCategory && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                    Categoría activa: {activeCategory.complete_name}
                  </span>
                )}
              </div>
              {listing.searchTooShort && (
                <p className="mt-3 text-sm text-amber-700">
                  Escriba al menos {listing.minSearchLength} caracteres para aplicar la búsqueda.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}

          <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">
              Ver estructura completa de categorías
            </summary>
            <ul className="mt-4 space-y-3">{renderCategoryTree(categories)}</ul>
          </details>

          <div className="mb-6 flex flex-wrap gap-3 lg:hidden">
            {rootCategories.map((category) => {
              const isActive = selectedCategoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category.id)}
                  className={`rounded-full px-4 py-2 text-sm transition ${isActive ? 'bg-primary text-slate-900 font-semibold' : 'border border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary'}`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>

          <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-28 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Categorías</h2>
                    <p className="text-sm text-slate-500">Estructura completa del portafolio</p>
                  </div>
                  {(query || selectedCategoryId) && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-sm font-medium text-primary transition hover:text-primary/80"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <ul className="mt-5 space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {renderCategoryTree(categories)}
                </ul>
              </div>
            </aside>

            <div className="space-y-8">
              {showBrowseState && (
                <div className="space-y-8">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {rootCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => selectCategory(category.id)}
                        className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                              Categoría principal
                            </p>
                            <h3 className="mt-2 text-xl font-bold text-slate-900">{category.name}</h3>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-300" />
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-slate-500">{category.complete_name}</p>
                        <p className="mt-6 text-sm font-medium text-slate-700">
                          {countNestedCategories(category)} subcategorías disponibles
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!showBrowseState && (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-extrabold text-slate-900">
                        {activeCategory ? activeCategory.complete_name : query.trim() ? `Resultados para “${query.trim()}”` : 'Catálogo público'}
                      </h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {loading
                          ? 'Consultando catálogo...'
                          : `${listing.total} resultado${listing.total !== 1 ? 's' : ''}${activeCategory ? ` en ${activeCategory.name}` : ''}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {activeCategory && (
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                          {activeCategory.name}
                        </span>
                      )}
                      {query.trim() && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                          Búsqueda: {query.trim()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="mt-4 text-sm text-slate-500">Cargando resultados del catálogo...</p>
                </div>
              )}

              {showEmptyResults && (
                <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <Package className="mx-auto h-12 w-12 text-slate-200" />
                  <h3 className="mt-4 text-xl font-bold text-slate-900">No encontramos resultados con ese criterio</h3>
                  <p className="mt-2 text-slate-500">
                    Pruebe con otra referencia, una búsqueda más amplia o navegue desde la estructura de categorías.
                  </p>
                  <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-primary/40 hover:text-primary"
                    >
                      Limpiar filtros
                    </button>
                    <LeadButton fuente="catalogo_publico_sin_resultados" texto="Hablar con un asesor" variant="outline" className="px-5 py-3" />
                  </div>
                </div>
              )}

              {hasResults && !loading && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {listing.productos.map((producto) => {
                      const categoriaLabel = Array.isArray(producto.categ_id) ? producto.categ_id[1] : '';
                      const description = typeof producto.description_sale === 'string' ? producto.description_sale : '';

                      return (
                        <article
                          key={producto.id}
                          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                        >
                          <div className="relative flex h-44 items-center justify-center bg-slate-50 p-4">
                            {producto.image_128 ? (
                              <Image
                                src={`data:image/png;base64,${producto.image_128}`}
                                alt={producto.name}
                                fill
                                unoptimized
                                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                                className="object-contain p-4"
                              />
                            ) : (
                              <Package className="h-12 w-12 text-slate-200" />
                            )}
                          </div>
                          <div className="p-5">
                            {categoriaLabel && (
                              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                                {categoriaLabel}
                              </span>
                            )}
                            {typeof producto.default_code === 'string' && producto.default_code && (
                              <p className="mt-3 text-xs font-mono text-slate-400">Ref: {producto.default_code}</p>
                            )}
                            <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{producto.name}</h3>
                            {description && (
                              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-500">{description}</p>
                            )}
                            <p className="mt-4 text-sm font-medium text-slate-400">Unidad: {producto.uom_name || 'und'}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {listing.totalPages > 1 && (
                    <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm sm:flex-row">
                      <p className="text-sm text-slate-500">
                        Página {listing.query.page} de {listing.totalPages}
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPage((current) => Math.max(1, current - 1))}
                          disabled={listing.query.page <= 1}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition enabled:hover:border-primary/40 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => setPage((current) => Math.min(listing.totalPages, current + 1))}
                          disabled={listing.query.page >= listing.totalPages}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition enabled:hover:border-primary/40 enabled:hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
                <h3 className="text-2xl font-extrabold text-slate-900">¿Quiere comprar con condiciones corporativas?</h3>
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
                  <LeadButton fuente="catalogo_publico_cta" texto="Hablar con un asesor" variant="whatsapp" className="px-8 py-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
