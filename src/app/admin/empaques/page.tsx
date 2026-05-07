'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Package,
  Percent,
  Save,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';

type TabId = 'configuracion' | 'margenes' | 'precios' | 'editorial';
type PublicationState = 'borrador' | 'publicado';

interface StorefrontConfig {
  id: string;
  slug: string;
  nombre: string;
  subdominio: string | null;
  modo_pricing: 'pricelist' | 'costo_margen';
  activo: boolean;
  odoo_root_category_ids: number[];
  odoo_excluded_category_ids: number[];
  configuracion_extra: Record<string, unknown> | null;
}

interface CategoryNode {
  id: number;
  name: string;
  complete_name: string;
  children: CategoryNode[];
}

interface CatalogProduct {
  id: number;
  name: string;
  default_code: string | false;
  categ_id: [number, string] | false;
  price: number | null;
  pricing_source: 'override' | 'costo_margen' | 'manual_pendiente';
  requiere_precio_manual: boolean;
}

interface CatalogResponse {
  categories: CategoryNode[];
  productos: CatalogProduct[];
  total: number;
  totalPages: number;
  query: {
    page: number;
  };
}

interface MargenRow {
  id: string;
  odoo_categ_id: number | null;
  margen_porcentaje: number;
}

interface PrecioRow {
  id: string;
  odoo_product_id: number;
  precio_override: number;
}

interface CategoryOverrideRow {
  id: string;
  odoo_categ_id: number;
  nombre_publico: string | null;
  slug: string | null;
  descripcion_corta: string | null;
  imagen_url: string | null;
  orden: number;
  visible: boolean;
  destacado: boolean;
  seo_title: string | null;
  seo_description: string | null;
  estado_publicacion: PublicationState;
}

interface ProductOverrideRow {
  id: string;
  odoo_product_id: number;
  nombre_publico: string | null;
  slug: string | null;
  descripcion_corta: string | null;
  descripcion_larga: string | null;
  imagen_url: string | null;
  orden: number;
  visible: boolean;
  destacado: boolean;
  seo_title: string | null;
  seo_description: string | null;
  estado_publicacion: PublicationState;
}

interface CategoryEditorialDraft {
  nombre_publico: string;
  slug: string;
  descripcion_corta: string;
  imagen_url: string;
  orden: string;
  visible: boolean;
  destacado: boolean;
  estado_publicacion: PublicationState;
}

interface ProductEditorialDraft {
  nombre_publico: string;
  slug: string;
  descripcion_corta: string;
  descripcion_larga: string;
  imagen_url: string;
  orden: string;
  visible: boolean;
  destacado: boolean;
  seo_title: string;
  seo_description: string;
  estado_publicacion: PublicationState;
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function parseIdList(value: string) {
  return Array.from(new Set(
    value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0)
      .map((item) => Math.trunc(item))
  ));
}

function formatIdList(value: number[] | null | undefined) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function flattenCategories(categories: CategoryNode[]) {
  const result: CategoryNode[] = [];
  const visit = (category: CategoryNode) => {
    result.push(category);
    category.children.forEach(visit);
  };
  categories.forEach(visit);
  return result;
}

function getDescription(config: StorefrontConfig | null) {
  const value = config?.configuracion_extra?.descripcion;
  return typeof value === 'string' ? value : '';
}

function buildCategoryDraft(category: CategoryNode, override?: CategoryOverrideRow): CategoryEditorialDraft {
  return {
    nombre_publico: override?.nombre_publico ?? category.name,
    slug: override?.slug ?? slugify(category.complete_name),
    descripcion_corta: override?.descripcion_corta ?? '',
    imagen_url: override?.imagen_url ?? '',
    orden: String(override?.orden ?? 0),
    visible: override?.visible ?? true,
    destacado: override?.destacado ?? false,
    estado_publicacion: override?.estado_publicacion ?? 'borrador',
  };
}

function buildProductDraft(product: CatalogProduct, override?: ProductOverrideRow): ProductEditorialDraft {
  return {
    nombre_publico: override?.nombre_publico ?? product.name,
    slug: override?.slug ?? slugify(product.name),
    descripcion_corta: override?.descripcion_corta ?? '',
    descripcion_larga: override?.descripcion_larga ?? '',
    imagen_url: override?.imagen_url ?? '',
    orden: String(override?.orden ?? 0),
    visible: override?.visible ?? true,
    destacado: override?.destacado ?? false,
    seo_title: override?.seo_title ?? '',
    seo_description: override?.seo_description ?? '',
    estado_publicacion: override?.estado_publicacion ?? 'borrador',
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || data?.details || 'No se pudo completar la operación.');
  }
  return data as T;
}

export default function AdminEmpaquesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('configuracion');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingMargin, setSavingMargin] = useState(false);
  const [savingPriceId, setSavingPriceId] = useState<number | null>(null);
  const [savingEditorial, setSavingEditorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [margenes, setMargenes] = useState<MargenRow[]>([]);
  const [precios, setPrecios] = useState<PrecioRow[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<CategoryOverrideRow[]>([]);
  const [productOverrides, setProductOverrides] = useState<ProductOverrideRow[]>([]);

  const [nombre, setNombre] = useState('');
  const [subdominio, setSubdominio] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [modoPricing, setModoPricing] = useState<'pricelist' | 'costo_margen'>('costo_margen');
  const [activo, setActivo] = useState(true);
  const [rootCategoryIds, setRootCategoryIds] = useState('');
  const [excludedCategoryIds, setExcludedCategoryIds] = useState('');

  const [margenCategoryId, setMargenCategoryId] = useState('');
  const [margenPorcentaje, setMargenPorcentaje] = useState('20');

  const [productSearch, setProductSearch] = useState('');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [editorialCategoryId, setEditorialCategoryId] = useState('');
  const [editorialProductId, setEditorialProductId] = useState('');
  const [categoryDraft, setCategoryDraft] = useState<CategoryEditorialDraft | null>(null);
  const [productDraft, setProductDraft] = useState<ProductEditorialDraft | null>(null);

  const categories = useMemo(() => flattenCategories(catalog?.categories ?? []), [catalog?.categories]);
  const preciosByProductId = useMemo(() => {
    const map = new Map<number, PrecioRow>();
    precios.forEach((precio) => map.set(precio.odoo_product_id, precio));
    return map;
  }, [precios]);
  const categoryOverridesById = useMemo(() => {
    const map = new Map<number, CategoryOverrideRow>();
    categoryOverrides.forEach((override) => map.set(override.odoo_categ_id, override));
    return map;
  }, [categoryOverrides]);
  const productOverridesById = useMemo(() => {
    const map = new Map<number, ProductOverrideRow>();
    productOverrides.forEach((override) => map.set(override.odoo_product_id, override));
    return map;
  }, [productOverrides]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const loadConfig = useCallback(async () => {
    const data = await parseJsonResponse<{ storefront: StorefrontConfig }>(
      await fetch('/api/admin/storefronts/empaques')
    );

    setStorefront(data.storefront);
    setNombre(data.storefront.nombre ?? '');
    setSubdominio(data.storefront.subdominio ?? '');
    setDescripcion(getDescription(data.storefront));
    setModoPricing(data.storefront.modo_pricing ?? 'costo_margen');
    setActivo(Boolean(data.storefront.activo));
    setRootCategoryIds(formatIdList(data.storefront.odoo_root_category_ids));
    setExcludedCategoryIds(formatIdList(data.storefront.odoo_excluded_category_ids));
  }, []);

  const loadMargenes = useCallback(async () => {
    const data = await parseJsonResponse<{ margenes: MargenRow[] }>(
      await fetch('/api/admin/storefronts/empaques/margenes')
    );
    setMargenes(data.margenes);
  }, []);

  const loadPrecios = useCallback(async () => {
    const data = await parseJsonResponse<{ precios: PrecioRow[] }>(
      await fetch('/api/admin/storefronts/empaques/precios')
    );
    setPrecios(data.precios);
  }, []);

  const loadCategoryOverrides = useCallback(async () => {
    const data = await parseJsonResponse<{ categorias: CategoryOverrideRow[] }>(
      await fetch('/api/admin/storefronts/empaques/categorias')
    );
    setCategoryOverrides(data.categorias);
  }, []);

  const loadProductOverrides = useCallback(async () => {
    const data = await parseJsonResponse<{ productos: ProductOverrideRow[] }>(
      await fetch('/api/admin/storefronts/empaques/productos')
    );
    setProductOverrides(data.productos);
  }, []);

  const loadCatalog = useCallback(async () => {
    const params = new URLSearchParams({ limit: '12', page: String(productPage) });
    if (productSearch.trim()) params.set('search', productSearch.trim());
    if (productCategoryId) params.set('category_id', productCategoryId);

    const data = await parseJsonResponse<CatalogResponse>(
      await fetch(`/api/admin/storefronts/empaques/catalogo?${params.toString()}`)
    );
    setCatalog(data);
  }, [productCategoryId, productPage, productSearch]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadConfig(), loadMargenes(), loadPrecios(), loadCategoryOverrides(), loadProductOverrides()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el panel de Empaques.');
    } finally {
      setLoading(false);
    }
  }, [loadCategoryOverrides, loadConfig, loadMargenes, loadPrecios, loadProductOverrides]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!loading) {
      void loadCatalog().catch((catalogError) => {
        setError(catalogError instanceof Error ? catalogError.message : 'No se pudo cargar el catálogo.');
      });
    }
  }, [loadCatalog, loading]);

  useEffect(() => {
    const selectedCategory = categories.find((category) => String(category.id) === editorialCategoryId);
    setCategoryDraft(selectedCategory ? buildCategoryDraft(selectedCategory, categoryOverridesById.get(selectedCategory.id)) : null);
  }, [categories, categoryOverridesById, editorialCategoryId]);

  useEffect(() => {
    const selectedProduct = (catalog?.productos ?? []).find((product) => String(product.id) === editorialProductId);
    setProductDraft(selectedProduct ? buildProductDraft(selectedProduct, productOverridesById.get(selectedProduct.id)) : null);
  }, [catalog?.productos, editorialProductId, productOverridesById]);

  const handleSaveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingConfig(true);
    setError(null);

    try {
      const data = await parseJsonResponse<{ storefront: StorefrontConfig }>(
        await fetch('/api/admin/storefronts/empaques', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre,
            subdominio,
            descripcion,
            modo_pricing: modoPricing,
            activo,
            odoo_root_category_ids: parseIdList(rootCategoryIds),
            odoo_excluded_category_ids: parseIdList(excludedCategoryIds),
          }),
        })
      );

      setStorefront(data.storefront);
      showToast('Configuración guardada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la configuración.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveMargin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingMargin(true);
    setError(null);

    try {
      await parseJsonResponse<{ margen: MargenRow }>(
        await fetch('/api/admin/storefronts/empaques/margenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            odoo_categ_id: margenCategoryId ? Number(margenCategoryId) : null,
            margen_porcentaje: Number(margenPorcentaje),
          }),
        })
      );

      await loadMargenes();
      setMargenCategoryId('');
      setMargenPorcentaje('20');
      showToast('Margen guardado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el margen.');
    } finally {
      setSavingMargin(false);
    }
  };

  const handleDeleteMargin = async (margenId: string) => {
    setError(null);

    try {
      await parseJsonResponse<{ ok: true }>(
        await fetch(`/api/admin/storefronts/empaques/margenes?margen_id=${encodeURIComponent(margenId)}`, {
          method: 'DELETE',
        })
      );
      await loadMargenes();
      showToast('Margen eliminado.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el margen.');
    }
  };

  const handleSavePrice = async (product: CatalogProduct) => {
    setSavingPriceId(product.id);
    setError(null);

    try {
      const value = priceDrafts[product.id] ?? String(preciosByProductId.get(product.id)?.precio_override ?? product.price ?? '');
      await parseJsonResponse<{ precio: PrecioRow }>(
        await fetch('/api/admin/storefronts/empaques/precios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            odoo_product_id: product.id,
            precio_override: Number(value),
          }),
        })
      );
      await Promise.all([loadPrecios(), loadCatalog()]);
      showToast('Precio manual guardado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el precio manual.');
    } finally {
      setSavingPriceId(null);
    }
  };

  const handleDeletePrice = async (precio: PrecioRow) => {
    setSavingPriceId(precio.odoo_product_id);
    setError(null);

    try {
      await parseJsonResponse<{ ok: true }>(
        await fetch(`/api/admin/storefronts/empaques/precios?precio_id=${encodeURIComponent(precio.id)}`, {
          method: 'DELETE',
        })
      );
      await Promise.all([loadPrecios(), loadCatalog()]);
      showToast('Precio manual eliminado.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el precio manual.');
    } finally {
      setSavingPriceId(null);
    }
  };

  const handleSaveCategoryEditorial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryDraft || !editorialCategoryId) return;
    setSavingEditorial(true);
    setError(null);

    try {
      await parseJsonResponse<{ categoria: CategoryOverrideRow }>(
        await fetch('/api/admin/storefronts/empaques/categorias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            odoo_categ_id: Number(editorialCategoryId),
            nombre_publico: categoryDraft.nombre_publico,
            slug: categoryDraft.slug,
            descripcion_corta: categoryDraft.descripcion_corta,
            imagen_url: categoryDraft.imagen_url,
            orden: Number(categoryDraft.orden),
            visible: categoryDraft.visible,
            destacado: categoryDraft.destacado,
            estado_publicacion: categoryDraft.estado_publicacion,
          }),
        })
      );
      await loadCategoryOverrides();
      showToast('Categoría editorial guardada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la categoría editorial.');
    } finally {
      setSavingEditorial(false);
    }
  };

  const handleSaveProductEditorial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productDraft || !editorialProductId) return;
    setSavingEditorial(true);
    setError(null);

    try {
      await parseJsonResponse<{ producto: ProductOverrideRow }>(
        await fetch('/api/admin/storefronts/empaques/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            odoo_product_id: Number(editorialProductId),
            nombre_publico: productDraft.nombre_publico,
            slug: productDraft.slug,
            descripcion_corta: productDraft.descripcion_corta,
            descripcion_larga: productDraft.descripcion_larga,
            imagen_url: productDraft.imagen_url,
            orden: Number(productDraft.orden),
            visible: productDraft.visible,
            destacado: productDraft.destacado,
            seo_title: productDraft.seo_title,
            seo_description: productDraft.seo_description,
            estado_publicacion: productDraft.estado_publicacion,
          }),
        })
      );
      await loadProductOverrides();
      showToast('Producto editorial guardado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el producto editorial.');
    } finally {
      setSavingEditorial(false);
    }
  };

  const handleSearchProducts = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProductPage(1);
    void loadCatalog();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'configuracion', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
    { id: 'margenes', label: 'Márgenes', icon: <Percent className="h-4 w-4" /> },
    { id: 'precios', label: 'Precios manuales', icon: <Package className="h-4 w-4" /> },
    { id: 'editorial', label: 'Editorial', icon: <Package className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empaques</h1>
          <p className="mt-1 text-sm text-slate-500">Administra el storefront público sin crear una empresa cliente.</p>
        </div>
        <Link
          href="/empaques"
          target="_blank"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Ver storefront
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs font-bold text-red-500">Cerrar</button>
        </div>
      )}

      {toast && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}

      <div className="flex items-center gap-1 rounded-xl border border-border bg-white p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'configuracion' && (
        <form onSubmit={handleSaveConfig} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Nombre</span>
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Subdominio</span>
              <input
                value={subdominio}
                onChange={(event) => setSubdominio(event.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Modo pricing</span>
              <select
                value={modoPricing}
                onChange={(event) => setModoPricing(event.target.value as StorefrontConfig['modo_pricing'])}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="costo_margen">Costo + margen</option>
                <option value="pricelist">Pricelist</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <input
                type="checkbox"
                checked={activo}
                onChange={(event) => setActivo(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm font-semibold text-slate-700">Storefront activo</span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Categorías raíz Odoo</span>
              <input
                value={rootCategoryIds}
                onChange={(event) => setRootCategoryIds(event.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Categorías excluidas Odoo</span>
              <input
                value={excludedCategoryIds}
                onChange={(event) => setExcludedCategoryIds(event.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Descripción editorial</span>
              <textarea
                value={descripcion}
                onChange={(event) => setDescripcion(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
            <span className="text-xs text-slate-500">Slug: {storefront?.slug ?? 'empaques'}</span>
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar configuración
            </button>
          </div>
        </form>
      )}

      {activeTab === 'margenes' && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <form onSubmit={handleSaveMargin} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Crear o actualizar margen</h2>
            <div className="mt-5 space-y-4">
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-700">Categoría</span>
                <select
                  value={margenCategoryId}
                  onChange={(event) => setMargenCategoryId(event.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Margen default</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.complete_name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-700">Margen (%)</span>
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="0.01"
                  value={margenPorcentaje}
                  onChange={(event) => setMargenPorcentaje(event.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={savingMargin}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingMargin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar margen
            </button>
          </form>

          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Márgenes configurados</h2>
            </div>
            <div className="divide-y divide-border">
              {margenes.map((margen) => {
                const category = categories.find((item) => item.id === margen.odoo_categ_id);
                return (
                  <div key={margen.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div>
                      <p className="font-semibold text-slate-900">{category?.complete_name ?? 'Margen default'}</p>
                      <p className="text-xs text-slate-500">{margen.odoo_categ_id ? `Categoría Odoo ${margen.odoo_categ_id}` : 'Aplica si no existe margen específico'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{Number(margen.margen_porcentaje).toFixed(2)}%</span>
                      <button onClick={() => void handleDeleteMargin(margen.id)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {margenes.length === 0 && <div className="px-6 py-8 text-sm text-slate-500">No hay márgenes configurados.</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'precios' && (
        <div className="space-y-6">
          <form onSubmit={handleSearchProducts} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar producto por nombre o código"
                  className="w-full rounded-lg border border-border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <select
                value={productCategoryId}
                onChange={(event) => {
                  setProductCategoryId(event.target.value);
                  setProductPage(1);
                }}
                className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.complete_name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800">Buscar</button>
            </div>
          </form>

          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Productos del storefront</h2>
                <p className="text-sm text-slate-500">{catalog?.total ?? 0} producto{catalog?.total === 1 ? '' : 's'} encontrado{catalog?.total === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {(catalog?.productos ?? []).map((product) => {
                const override = preciosByProductId.get(product.id);
                const draftValue = priceDrafts[product.id] ?? String(override?.precio_override ?? product.price ?? '');
                const saving = savingPriceId === product.id;

                return (
                  <div key={product.id} className="grid gap-4 px-6 py-4 lg:grid-cols-[1fr_180px_280px] lg:items-center">
                    <div>
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.default_code ? `${product.default_code} · ` : ''}{product.categ_id ? product.categ_id[1] : 'Sin categoría'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Precio actual</p>
                      <p className="font-bold text-slate-900">{product.price === null ? 'Pendiente' : currencyFormatter.format(product.price)}</p>
                      <p className="text-xs text-slate-500">{product.pricing_source === 'override' ? 'Manual' : product.pricing_source === 'costo_margen' ? 'Costo + margen' : 'Pendiente manual'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draftValue}
                        onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => void handleSavePrice(product)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </button>
                      {override && (
                        <button
                          onClick={() => void handleDeletePrice(override)}
                          disabled={saving}
                          className="rounded-lg p-2.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {(!catalog || catalog.productos.length === 0) && <div className="px-6 py-8 text-sm text-slate-500">No hay productos para mostrar.</div>}
            </div>
            {(catalog?.totalPages ?? 0) > 1 && (
              <div className="flex items-center justify-center gap-3 border-t border-border px-6 py-4">
                <button
                  onClick={() => setProductPage((current) => Math.max(1, current - 1))}
                  disabled={productPage <= 1}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm font-semibold text-slate-600">Página {productPage} de {catalog?.totalPages ?? 1}</span>
                <button
                  onClick={() => setProductPage((current) => Math.min(catalog?.totalPages ?? current, current + 1))}
                  disabled={productPage >= (catalog?.totalPages ?? 1)}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'editorial' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={handleSaveCategoryEditorial} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900">Categorías editoriales</h2>
              <p className="text-sm text-slate-500">Controla nombres comerciales, visibilidad y destacados por categoría Odoo.</p>
            </div>
            <div className="space-y-4">
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-700">Categoría</span>
                <select
                  value={editorialCategoryId}
                  onChange={(event) => setEditorialCategoryId(event.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecciona una categoría</option>
                  {categories.map((category) => {
                    const override = categoryOverridesById.get(category.id);
                    return (
                      <option key={category.id} value={category.id}>
                        {override?.nombre_publico ?? category.complete_name}{override?.estado_publicacion === 'publicado' ? ' · publicado' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              {categoryDraft && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Nombre público</span>
                      <input
                        value={categoryDraft.nombre_publico}
                        onChange={(event) => setCategoryDraft((current) => current ? { ...current, nombre_publico: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Slug</span>
                      <input
                        value={categoryDraft.slug}
                        onChange={(event) => setCategoryDraft((current) => current ? { ...current, slug: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                  </div>
                  <label className="space-y-2 block">
                    <span className="text-sm font-semibold text-slate-700">Descripción corta</span>
                    <textarea
                      value={categoryDraft.descripcion_corta}
                      onChange={(event) => setCategoryDraft((current) => current ? { ...current, descripcion_corta: event.target.value } : current)}
                      rows={3}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-[1fr_120px]">
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Imagen URL</span>
                      <input
                        value={categoryDraft.imagen_url}
                        onChange={(event) => setCategoryDraft((current) => current ? { ...current, imagen_url: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Orden</span>
                      <input
                        type="number"
                        value={categoryDraft.orden}
                        onChange={(event) => setCategoryDraft((current) => current ? { ...current, orden: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={categoryDraft.visible}
                        onChange={(event) => setCategoryDraft((current) => current ? { ...current, visible: event.target.checked } : current)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Visible
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={categoryDraft.destacado}
                        onChange={(event) => setCategoryDraft((current) => current ? { ...current, destacado: event.target.checked } : current)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Destacada
                    </label>
                    <select
                      value={categoryDraft.estado_publicacion}
                      onChange={(event) => setCategoryDraft((current) => current ? { ...current, estado_publicacion: event.target.value as PublicationState } : current)}
                      className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="borrador">Borrador</option>
                      <option value="publicado">Publicado</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={savingEditorial}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingEditorial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar categoría
                  </button>
                </>
              )}
            </div>
          </form>

          <form onSubmit={handleSaveProductEditorial} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-slate-900">Productos editoriales</h2>
              <p className="text-sm text-slate-500">Edita contenido público sobre los productos cargados desde Odoo en la página actual.</p>
            </div>
            <div className="space-y-4">
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-700">Producto</span>
                <select
                  value={editorialProductId}
                  onChange={(event) => setEditorialProductId(event.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecciona un producto</option>
                  {(catalog?.productos ?? []).map((product) => {
                    const override = productOverridesById.get(product.id);
                    return (
                      <option key={product.id} value={product.id}>
                        {override?.nombre_publico ?? product.name}{override?.estado_publicacion === 'publicado' ? ' · publicado' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              {productDraft && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Nombre público</span>
                      <input
                        value={productDraft.nombre_publico}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, nombre_publico: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Slug</span>
                      <input
                        value={productDraft.slug}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, slug: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                  </div>
                  <label className="space-y-2 block">
                    <span className="text-sm font-semibold text-slate-700">Descripción corta</span>
                    <textarea
                      value={productDraft.descripcion_corta}
                      onChange={(event) => setProductDraft((current) => current ? { ...current, descripcion_corta: event.target.value } : current)}
                      rows={3}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="space-y-2 block">
                    <span className="text-sm font-semibold text-slate-700">Descripción larga</span>
                    <textarea
                      value={productDraft.descripcion_larga}
                      onChange={(event) => setProductDraft((current) => current ? { ...current, descripcion_larga: event.target.value } : current)}
                      rows={4}
                      className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-[1fr_120px]">
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Imagen URL</span>
                      <input
                        value={productDraft.imagen_url}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, imagen_url: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">Orden</span>
                      <input
                        type="number"
                        value={productDraft.orden}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, orden: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">SEO title</span>
                      <input
                        value={productDraft.seo_title}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, seo_title: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-sm font-semibold text-slate-700">SEO description</span>
                      <input
                        value={productDraft.seo_description}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, seo_description: event.target.value } : current)}
                        className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={productDraft.visible}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, visible: event.target.checked } : current)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Visible
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={productDraft.destacado}
                        onChange={(event) => setProductDraft((current) => current ? { ...current, destacado: event.target.checked } : current)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Destacado
                    </label>
                    <select
                      value={productDraft.estado_publicacion}
                      onChange={(event) => setProductDraft((current) => current ? { ...current, estado_publicacion: event.target.value as PublicationState } : current)}
                      className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="borrador">Borrador</option>
                      <option value="publicado">Publicado</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={savingEditorial}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingEditorial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar producto
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
