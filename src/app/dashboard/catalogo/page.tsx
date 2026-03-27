'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import type { VariantCartInput } from '@/contexts/CartContext';
import { Search, Filter, ShoppingCart, Plus, Minus, Check, Package } from 'lucide-react';
import { cn, formatCOP } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import VariantSelectorModal from '@/components/catalogo/VariantSelectorModal';

interface ProductoOdooRaw {
  id: number;
  name: string;
  description_sale: string | false;
  list_price: number;
  uom_name: string;
  categ_id: [number, string];
  product_tag_ids: number[];
  active: boolean;
  sale_ok: boolean;
  image_128: string | false;
  default_code: string | false;
  product_variant_count?: number;
  attribute_line_ids?: number[];
}

interface CategoriaFiltro {
  id: number | 'todos';
  label: string;
}

export default function CatalogoPage() {
  const { user, showPrices } = useAuth();
  const { addItem, addVariantItem, getItemQuantity, updateQuantity } = useCart();
  const [productos, setProductos] = useState<ProductoOdooRaw[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFiltro[]>([{ id: 'todos', label: 'Todos' }]);
  const [loading, setLoading] = useState(true);
  const [errorOdoo, setErrorOdoo] = useState<string | null>(null);
  const [avisoCatalogo, setAvisoCatalogo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<number | 'todos'>('todos');
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [variantModalProduct, setVariantModalProduct] = useState<ProductoOdooRaw | null>(null);

  const fetchProductos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorOdoo(null);
    setAvisoCatalogo(null);

    try {
      const supabase = createClient();

      // 1. Obtener la empresa del usuario para obtener su odoo_partner_id
      const { data: empresa } = await supabase
        .from('empresas')
        .select('odoo_partner_id')
        .eq('id', user.empresa_id)
        .single();

      const { data: configEmpresa } = await supabase
        .from('empresa_configs')
        .select('configuracion_extra, odoo_pricelist_id')
        .eq('empresa_id', user.empresa_id)
        .maybeSingle();

      const { data: productosAutorizados } = await supabase
        .from('productos_autorizados')
        .select('odoo_product_id')
        .eq('empresa_id', user.empresa_id)
        .eq('activo', true);

      if (!empresa?.odoo_partner_id) {
        throw new Error('Empresa no configurada correctamente');
      }

      const extra =
        configEmpresa?.configuracion_extra && typeof configEmpresa.configuracion_extra === 'object'
          ? (configEmpresa.configuracion_extra as Record<string, unknown>)
          : {};
      const restringirCatalogo = Boolean(extra.restringir_catalogo_portal);
      const autorizadosSet = new Set((productosAutorizados || []).map((item) => item.odoo_product_id));

      // 2. Obtener productos desde Odoo filtrados por el partner_id y pricelist
      const catalogParams = new URLSearchParams({ partner_id: String(empresa.odoo_partner_id) });
      const plId = (configEmpresa as Record<string, unknown> | null)?.odoo_pricelist_id;
      if (plId && Number.isFinite(Number(plId)) && Number(plId) > 0) {
        catalogParams.set('pricelist_id', String(plId));
      }
      const res = await fetch(`/api/odoo/productos?${catalogParams.toString()}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error cargando productos');

      const prodsBase: ProductoOdooRaw[] = data.productos || [];
      const prods = restringirCatalogo
        ? prodsBase.filter((producto) => autorizadosSet.has(producto.id))
        : prodsBase;
      setProductos(prods);

      if (restringirCatalogo && autorizadosSet.size === 0) {
        setAvisoCatalogo('Tu empresa tiene catálogo restringido, pero aún no tiene productos habilitados por el administrador.');
      }

      // Construir lista de categorías únicas desde los productos
      const categMap = new Map<number, string>();
      prods.forEach((p) => {
        if (p.categ_id && Array.isArray(p.categ_id)) {
          categMap.set(p.categ_id[0], p.categ_id[1]);
        }
      });
      const cats: CategoriaFiltro[] = [
        { id: 'todos', label: 'Todos' },
        ...Array.from(categMap.entries()).map(([id, label]) => ({ id, label })),
      ];
      setCategorias(cats);
    } catch (err) {
      setErrorOdoo(err instanceof Error ? err.message : 'Error desconocido');
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const handleAddToCart = (producto: ProductoOdooRaw) => {
    const variantCount = producto.product_variant_count ?? 1;

    if (variantCount > 1) {
      setVariantModalProduct(producto);
      return;
    }

    addItem(
      {
        odoo_product_id: producto.id,
        nombre: producto.name,
        precio_unitario: producto.list_price,
        unidad: producto.uom_name || 'und',
        categoria: Array.isArray(producto.categ_id) ? producto.categ_id[1] : '',
        disponible: producto.active && producto.sale_ok,
        imagen_url: producto.image_128 ? `data:image/png;base64,${producto.image_128}` : undefined,
        referencia: typeof producto.default_code === 'string' ? producto.default_code : undefined,
      },
      1
    );
    markAdded(producto.id);
  };

  const handleAddVariant = (variant: {
    variantId: number;
    variantName: string;
    price: number;
    image: string | null;
    defaultCode: string | null;
    selectedAttributes: string;
  }) => {
    if (!variantModalProduct) return;
    const input: VariantCartInput = {
      templateId: variantModalProduct.id,
      variantId: variant.variantId,
      variantName: variant.variantName,
      price: variant.price,
      image: variant.image,
      defaultCode: variant.defaultCode,
      selectedAttributes: variant.selectedAttributes,
      unidad: variantModalProduct.uom_name || 'und',
      categoria: Array.isArray(variantModalProduct.categ_id) ? variantModalProduct.categ_id[1] : '',
    };
    addVariantItem(input, 1);
    markAdded(variantModalProduct.id);
  };

  const markAdded = (productId: number) => {
    setAddedIds((prev) => new Set(prev).add(productId));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }, 1500);
  };

  const productosFiltrados = productos.filter((p) => {
    const matchCateg =
      categoriaActiva === 'todos' ||
      (Array.isArray(p.categ_id) && p.categ_id[0] === categoriaActiva);
    const matchBusqueda =
      !busqueda.trim() ||
      p.name.toLowerCase().includes(busqueda.toLowerCase()) ||
      (typeof p.default_code === 'string' && p.default_code.toLowerCase().includes(busqueda.toLowerCase()));
    return matchCateg && matchBusqueda;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Catálogo de Productos
          </h1>
          <p className="text-muted text-sm mt-1">
            {loading
              ? 'Cargando desde Odoo...'
              : errorOdoo
              ? 'Error al cargar productos'
              : `${productosFiltrados.length} producto${productosFiltrados.length !== 1 ? 's' : ''} disponible${productosFiltrados.length !== 1 ? 's' : ''}`
            }
            {!showPrices && !loading && ' — Catálogo sin precios'}
          </p>
        </div>
        <Link
          href="/dashboard/carrito"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          Ver Carrito
        </Link>
      </div>

      {/* Búsqueda y filtros */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Buscar por nombre o referencia..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-background-light border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-muted shrink-0" />
          {categorias.map((cat) => (
            <button
              key={String(cat.id)}
              onClick={() => setCategoriaActiva(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                categoriaActiva === cat.id
                  ? 'bg-primary text-white'
                  : 'bg-background-light text-muted hover:bg-border'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Odoo */}
      {errorOdoo && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Error conectando con Odoo:</strong> {errorOdoo}
        </div>
      )}

      {avisoCatalogo && !loading && !errorOdoo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          {avisoCatalogo}
        </div>
      )}

      {/* Grid de productos */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 animate-pulse">
              <div className="w-full h-32 bg-background-light rounded-lg mb-3" />
              <div className="h-4 bg-background-light rounded w-3/4 mb-2" />
              <div className="h-3 bg-background-light rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : productosFiltrados.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {productosFiltrados.map((producto) => {
            const cantidadEnCarrito = getItemQuantity(producto.id);
            const justAdded = addedIds.has(producto.id);
            const categoriaLabel = Array.isArray(producto.categ_id) ? producto.categ_id[1] : '';

            return (
              <div
                key={producto.id}
                className="bg-white rounded-xl border border-border hover:border-primary/30 hover:shadow-sm transition-all overflow-hidden flex flex-col"
              >
                {/* Imagen o placeholder */}
                <div className="w-full h-44 bg-background-light flex items-center justify-center p-4">
                  {producto.image_128 ? (
                    <img
                      src={`data:image/png;base64,${producto.image_128}`}
                      alt={producto.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Package className="w-10 h-10 text-border" />
                  )}
                </div>

                <div className="p-4 flex flex-col flex-1">
                  {categoriaLabel && (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {categoriaLabel}
                    </span>
                  )}

                  {typeof producto.default_code === 'string' && producto.default_code && (
                    <p className="text-xs text-muted mt-2 font-mono">Ref: {producto.default_code}</p>
                  )}

                  <h3 className="text-sm font-semibold text-foreground mt-1 line-clamp-2 min-h-[2.5rem]">
                    {producto.name}
                  </h3>

                  {showPrices && (
                    <p className="text-lg font-bold text-foreground mt-2">
                      {formatCOP(producto.list_price)}
                      <span className="text-xs text-muted font-normal ml-1">/{producto.uom_name || 'und'}</span>
                    </p>
                  )}

                  <div className="mt-auto pt-3 border-t border-border">
                    {cantidadEnCarrito > 0 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(producto.id, cantidadEnCarrito - 1)}
                            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-semibold w-8 text-center">{cantidadEnCarrito}</span>
                          <button
                            onClick={() => updateQuantity(producto.id, cantidadEnCarrito + 1)}
                            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-xs text-primary font-medium">En carrito</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddToCart(producto)}
                        className={cn(
                          'w-full py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                          justAdded
                            ? 'bg-success text-white'
                            : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                        )}
                      >
                        {justAdded ? (
                          <><Check className="w-4 h-4" /> Agregado</>
                        ) : (producto.product_variant_count ?? 1) > 1 ? (
                          <><Plus className="w-4 h-4" /> Elegir variante</>
                        ) : (
                          <><Plus className="w-4 h-4" /> Agregar</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : !errorOdoo ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Package className="w-12 h-12 text-border mx-auto mb-3" />
          <p className="text-muted">
            {busqueda ? 'No hay productos que coincidan con la búsqueda.' : 'No hay productos disponibles en este momento.'}
          </p>
        </div>
      ) : null}

      {/* Modal de variantes */}
      {variantModalProduct && (
        <VariantSelectorModal
          product={variantModalProduct}
          open={Boolean(variantModalProduct)}
          onClose={() => setVariantModalProduct(null)}
          onAddToCart={handleAddVariant}
          showPrices={showPrices}
        />
      )}
    </div>
  );
}
