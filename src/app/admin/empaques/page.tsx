'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  Loader2,
  Lock,
  Package,
  Percent,
  Save,
  Search,
  Settings,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatMarkupPercent } from '@/lib/pricing/cost-staleness';
import { VariantsModal } from '@/components/admin/VariantsModal';
import { useAuth } from '@/contexts/AuthContext';
import { MediaUpload } from '@/components/admin/MediaUpload';

type TabId = 'configuracion' | 'margenes' | 'precios' | 'editorial' | 'asesoras';
type PublicationState = 'borrador' | 'publicado';

// Roles que pueden gestionar (config base + editorial + asignaciones de
// asesoras). El asesor entra a /admin/empaques vía asesor_storefronts y sólo
// ve las pestañas de pricing.
const MANAGE_ROLES = new Set(['super_admin', 'direccion']);
const PRICING_ROLES = new Set(['super_admin', 'direccion', 'asesor']);
const EDITORIAL_ROLES = new Set(['super_admin', 'direccion', 'editor_contenido']);

interface StorefrontConfig {
  id: string;
  slug: string;
  nombre: string;
  subdominio: string | null;
  modo_pricing: 'pricelist' | 'costo_margen';
  activo: boolean;
  odoo_root_category_ids: number[];
  odoo_excluded_category_ids: number[];
  odoo_pricelist_id: number | null;
  configuracion_extra: Record<string, unknown> | null;
}

interface OdooPricelistOption {
  id: number;
  name: string;
  currency: string | null;
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
  product_variant_count: number;
  /**
   * Campos sensibles enviados solo cuando el rol del actor es super_admin o
   * direccion. Para editor_contenido vienen como undefined.
   */
  standard_price?: number;
  write_date?: string | null;
  dias_desde_actualizacion?: number | null;
  costo_desactualizado?: boolean | null;
  markup_porcentaje?: number | null;
  variantes_divergentes?: boolean;
  variantes_consideradas?: number;
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
  ficha_tecnica_url: string | null;
  orden: number;
  visible: boolean;
  destacado: boolean;
  seo_title: string | null;
  seo_description: string | null;
  estado_publicacion: PublicationState;
}

interface AsesoraUsuario {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  activo: boolean;
}

interface AsesoraAsignacion {
  id: string;
  usuario_id: string;
  storefront_config_id: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  usuario: AsesoraUsuario | null;
}

interface AsesoraDisponible {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  activo: boolean;
  asignada: boolean;
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
  ficha_tecnica_url: string;
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
    ficha_tecnica_url: override?.ficha_tecnica_url ?? '',
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
  const { user } = useAuth();
  const userRol = user?.rol ?? null;
  const canManage = userRol ? MANAGE_ROLES.has(userRol) : false;
  const canEditorial = userRol ? EDITORIAL_ROLES.has(userRol) : false;
  const canPricing = userRol ? PRICING_ROLES.has(userRol) : false;

  // Pestaña inicial: si la actora no puede tocar configuración (caso asesor),
  // arrancamos directo en márgenes que es su flujo natural.
  const [activeTab, setActiveTab] = useState<TabId>(canManage ? 'configuracion' : 'margenes');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingMargin, setSavingMargin] = useState(false);
  const [savingPriceId, setSavingPriceId] = useState<number | null>(null);
  const [savingEditorial, setSavingEditorial] = useState(false);
  const [savingAsesoraId, setSavingAsesoraId] = useState<string | null>(null);
  const [variantsModal, setVariantsModal] = useState<{ templateId: number; productName: string; fallbackPrice?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [margenes, setMargenes] = useState<MargenRow[]>([]);
  const [precios, setPrecios] = useState<PrecioRow[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<CategoryOverrideRow[]>([]);
  const [productOverrides, setProductOverrides] = useState<ProductOverrideRow[]>([]);
  const [asesorasAsignadas, setAsesorasAsignadas] = useState<AsesoraAsignacion[]>([]);
  const [asesorasDisponibles, setAsesorasDisponibles] = useState<AsesoraDisponible[]>([]);
  const [asesoraSeleccionadaId, setAsesoraSeleccionadaId] = useState('');

  const [nombre, setNombre] = useState('');
  const [subdominio, setSubdominio] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [modoPricing, setModoPricing] = useState<'pricelist' | 'costo_margen'>('costo_margen');
  const [activo, setActivo] = useState(true);
  const [rootCategoryIds, setRootCategoryIds] = useState('');
  const [excludedCategoryIds, setExcludedCategoryIds] = useState('');
  const [pricelistId, setPricelistId] = useState<string>('');
  const [pricelists, setPricelists] = useState<OdooPricelistOption[]>([]);
  const [loadingPricelists, setLoadingPricelists] = useState(false);

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
    setPricelistId(
      typeof data.storefront.odoo_pricelist_id === 'number' && data.storefront.odoo_pricelist_id > 0
        ? String(data.storefront.odoo_pricelist_id)
        : ''
    );
  }, []);

  const loadPricelists = useCallback(async () => {
    setLoadingPricelists(true);
    try {
      const data = await parseJsonResponse<{ pricelists: OdooPricelistOption[] }>(
        await fetch('/api/odoo/pricelists')
      );
      setPricelists(data.pricelists ?? []);
    } catch (loadError) {
      console.error('[admin/empaques] no se pudieron cargar pricelists', loadError);
      setPricelists([]);
    } finally {
      setLoadingPricelists(false);
    }
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

  // Sub-recurso de asignaciones asesor ↔ storefront. Solo lo cargan los
  // roles MANAGE (super_admin/direccion); para asesores, dejamos los arrays
  // vacíos y la pestaña se oculta vía canManage.
  const loadAsesoras = useCallback(async () => {
    const data = await parseJsonResponse<{ asesoras: AsesoraAsignacion[]; disponibles: AsesoraDisponible[] }>(
      await fetch('/api/admin/storefronts/empaques/asesoras')
    );
    setAsesorasAsignadas(data.asesoras ?? []);
    setAsesorasDisponibles(data.disponibles ?? []);
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
      // Mínimo común: config + márgenes + precios. Editorial / pricelists /
      // asesoras se cargan condicionales según el rol para no disparar 403
      // en endpoints que el actor no puede consumir.
      const tasks: Promise<unknown>[] = [
        loadConfig(),
        loadMargenes(),
        loadPrecios(),
      ];

      if (canEditorial) {
        tasks.push(loadCategoryOverrides());
        tasks.push(loadProductOverrides());
      }
      if (canManage) {
        tasks.push(loadPricelists());
        tasks.push(loadAsesoras());
      }

      await Promise.all(tasks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el panel de Empaques.');
    } finally {
      setLoading(false);
    }
  }, [
    canEditorial,
    canManage,
    loadAsesoras,
    loadCategoryOverrides,
    loadConfig,
    loadMargenes,
    loadPrecios,
    loadPricelists,
    loadProductOverrides,
  ]);

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

  // Si la actora cambia de rol o entra a una pestaña que ya no le aplica,
  // forzamos un fallback al primer tab visible. La construcción del array
  // visible ocurre en el render abajo; aquí replicamos la condición mínima
  // para evitar setState durante render.
  useEffect(() => {
    const allowed: TabId[] = [
      ...(canManage ? (['configuracion'] as TabId[]) : []),
      ...(canPricing ? (['margenes', 'precios'] as TabId[]) : []),
      ...(canEditorial ? (['editorial'] as TabId[]) : []),
      ...(canManage ? (['asesoras'] as TabId[]) : []),
    ];
    if (allowed.length > 0 && !allowed.includes(activeTab)) {
      setActiveTab(allowed[0]);
    }
  }, [canManage, canPricing, canEditorial, activeTab]);

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
            odoo_pricelist_id: pricelistId === '' ? null : Number(pricelistId),
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
            ficha_tecnica_url: productDraft.ficha_tecnica_url,
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

  // ----------------------------------------------------------------
  // Asignaciones asesor ↔ storefront
  //
  // El UI se cierra a `canManage` (super_admin/direccion). Aún así, los
  // endpoints validan rol en el servidor; este handler asume que sólo se
  // llama desde la pestaña Asesoras.
  // ----------------------------------------------------------------
  const handleAssignAsesora = async () => {
    if (!asesoraSeleccionadaId) return;
    setSavingAsesoraId(asesoraSeleccionadaId);
    setError(null);

    try {
      await parseJsonResponse<{ asesora: AsesoraAsignacion }>(
        await fetch('/api/admin/storefronts/empaques/asesoras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario_id: asesoraSeleccionadaId, activo: true }),
        })
      );
      await loadAsesoras();
      setAsesoraSeleccionadaId('');
      showToast('Asesora asignada al storefront.');
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'No se pudo asignar la asesora.');
    } finally {
      setSavingAsesoraId(null);
    }
  };

  const handleUnassignAsesora = async (asignacion: AsesoraAsignacion) => {
    setSavingAsesoraId(asignacion.usuario_id);
    setError(null);

    try {
      await parseJsonResponse<{ ok: true }>(
        await fetch(
          `/api/admin/storefronts/empaques/asesoras?usuario_id=${encodeURIComponent(asignacion.usuario_id)}`,
          { method: 'DELETE' }
        )
      );
      await loadAsesoras();
      showToast('Asesora desasignada.');
    } catch (unassignError) {
      setError(unassignError instanceof Error ? unassignError.message : 'No se pudo desasignar la asesora.');
    } finally {
      setSavingAsesoraId(null);
    }
  };

  // Activar/desactivar manteniendo la fila (soft toggle). Útil cuando se
  // quiere quitar acceso temporal sin perder histórico de la asignación.
  const handleToggleAsesora = async (asignacion: AsesoraAsignacion) => {
    setSavingAsesoraId(asignacion.usuario_id);
    setError(null);

    try {
      await parseJsonResponse<{ asesora: AsesoraAsignacion }>(
        await fetch('/api/admin/storefronts/empaques/asesoras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario_id: asignacion.usuario_id, activo: !asignacion.activo }),
        })
      );
      await loadAsesoras();
      showToast(asignacion.activo ? 'Asesora desactivada.' : 'Asesora reactivada.');
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'No se pudo cambiar el estado.');
    } finally {
      setSavingAsesoraId(null);
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

  // Tabs visibles por rol. La actora asesor sólo ve pricing (márgenes y
  // precios manuales); MANAGE ve todo; editor_contenido pierde Configuración
  // y Asesoras (no decide pricing ni asignaciones).
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    ...(canManage
      ? [{ id: 'configuracion' as TabId, label: 'Configuración', icon: <Settings className="h-4 w-4" /> }]
      : []),
    ...(canPricing
      ? [
          { id: 'margenes' as TabId, label: 'Márgenes', icon: <Percent className="h-4 w-4" /> },
          { id: 'precios' as TabId, label: 'Precios manuales', icon: <Package className="h-4 w-4" /> },
        ]
      : []),
    ...(canEditorial
      ? [{ id: 'editorial' as TabId, label: 'Editorial', icon: <Package className="h-4 w-4" /> }]
      : []),
    ...(canManage
      ? [{ id: 'asesoras' as TabId, label: 'Asesoras', icon: <Users className="h-4 w-4" /> }]
      : []),
  ];

  return (
    <>
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
            <label className="space-y-2 md:col-span-2">
              <span className="flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>Pricelist Odoo (fuente de productos)</span>
                {loadingPricelists && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </span>
              <select
                value={pricelistId}
                onChange={(event) => setPricelistId(event.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">— Sin pricelist (usar categorías raíz) —</option>
                {pricelists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}{pl.currency ? ` (${pl.currency})` : ''}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Si seleccionas una pricelist, los productos del storefront se obtienen exclusivamente de las reglas de esa lista en Odoo y las categorías mostradas se derivan automáticamente de esos productos. Si la dejas vacía, se usan las categorías raíz de abajo.
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Categorías raíz Odoo</span>
              <input
                value={rootCategoryIds}
                onChange={(event) => setRootCategoryIds(event.target.value)}
                disabled={pricelistId !== ''}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
              />
              {pricelistId !== '' && (
                <span className="text-xs text-slate-500">Ignorado mientras haya una pricelist seleccionada.</span>
              )}
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

                const canSeeCost = product.standard_price !== undefined;
                const costStale = canSeeCost && product.costo_desactualizado === true;
                const markupValue = product.markup_porcentaje;
                const markupColor =
                  typeof markupValue !== 'number'
                    ? 'text-slate-400'
                    : markupValue < 0
                      ? 'text-red-600 font-bold'
                      : markupValue < 10
                        ? 'text-amber-600'
                        : 'text-emerald-600';

                return (
                  <div key={product.id} className="grid gap-4 px-6 py-4 lg:grid-cols-[1fr_220px_280px] lg:items-center">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        {product.product_variant_count > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setVariantsModal({
                                templateId: product.id,
                                productName: product.name,
                                fallbackPrice: product.price ?? undefined,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                            title="Ver variantes con costo, markup y antigüedad por variante"
                          >
                            <Layers className="h-3 w-3" />
                            {product.product_variant_count} variantes
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {product.default_code ? `${product.default_code} · ` : ''}{product.categ_id ? product.categ_id[1] : 'Sin categoría'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Precio</p>
                        {canSeeCost && typeof markupValue === 'number' && (
                          <span
                            className={`text-xs font-bold ${markupColor}`}
                            title={
                              markupValue < 0
                                ? 'Estás vendiendo a pérdida (precio menor al costo).'
                                : 'Margen sobre el costo de Odoo: (precio − costo) / costo.'
                            }
                          >
                            {markupValue < 0 && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
                            {formatMarkupPercent(markupValue)}
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-slate-900">{product.price === null ? 'Pendiente' : currencyFormatter.format(product.price)}</p>
                      <p className="text-xs text-slate-500">{product.pricing_source === 'override' ? 'Manual' : product.pricing_source === 'costo_margen' ? 'Costo + margen' : 'Pendiente manual'}</p>
                      {canSeeCost && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                          <span
                            className={costStale ? 'text-red-600 font-semibold' : 'text-slate-500'}
                            title={
                              costStale
                                ? 'El producto no se actualiza en Odoo desde hace más de 30 días. El costo podría estar desactualizado.'
                                : product.variantes_consideradas && product.variantes_consideradas > 1
                                  ? `Costo más alto entre ${product.variantes_consideradas} variantes activas (proxy del costo real más reciente).`
                                  : 'Costo registrado en Odoo (standard_price).'
                            }
                          >
                            Costo: {currencyFormatter.format(product.standard_price ?? 0)}
                          </span>
                          {product.variantes_divergentes && (
                            <span
                              className="inline-flex items-center text-amber-600"
                              title="Las variantes activas tienen costos muy distintos entre sí. Es posible que alguna variante tenga el costo desactualizado en Odoo. Revisa el producto."
                            >
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          )}
                          {typeof product.dias_desde_actualizacion === 'number' && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                costStale
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                              title="Días desde la última escritura sobre cualquier variante activa del producto en Odoo. Es proxy de antigüedad del costo: si nadie movió la variante en mucho tiempo (compra, ajuste, recosteo), el costo podría estar viejo."
                            >
                              {costStale && <AlertTriangle className="h-2.5 w-2.5" />}
                              {product.dias_desde_actualizacion === 0
                                ? 'hoy'
                                : `${product.dias_desde_actualizacion}d`}
                            </span>
                          )}
                        </div>
                      )}
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
                    <MediaUpload
                      label="Imagen de la categoría"
                      value={categoryDraft.imagen_url || null}
                      onChange={(url) => setCategoryDraft((current) => current ? { ...current, imagen_url: url } : current)}
                      uploadUrl="/api/admin/storefronts/empaques/upload"
                      kind="imagen"
                      folder="categorias"
                      helpText="PNG, JPG, SVG, WEBP o GIF. Máximo 5 MB."
                      disabled={savingEditorial}
                    />
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
                    <MediaUpload
                      label="Imagen del producto"
                      value={productDraft.imagen_url || null}
                      onChange={(url) => setProductDraft((current) => current ? { ...current, imagen_url: url } : current)}
                      uploadUrl="/api/admin/storefronts/empaques/upload"
                      kind="imagen"
                      folder="productos"
                      helpText="PNG, JPG, SVG, WEBP o GIF. Máximo 5 MB."
                      disabled={savingEditorial}
                    />
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
                  <MediaUpload
                    label="Ficha técnica (PDF)"
                    value={productDraft.ficha_tecnica_url || null}
                    onChange={(url) => setProductDraft((current) => current ? { ...current, ficha_tecnica_url: url } : current)}
                    uploadUrl="/api/admin/storefronts/empaques/upload"
                    kind="pdf"
                    folder="fichas"
                    helpText="Solo PDF. Máximo 10 MB. Se mostrará como descarga en la ficha pública del producto."
                    disabled={savingEditorial}
                  />
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

      {activeTab === 'asesoras' && canManage && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-slate-900">Asignar asesora al storefront</h2>
              <p className="text-sm text-slate-500">
                Las asesoras asignadas pueden editar márgenes y overrides de precio del storefront <strong>empaques</strong>. No pueden cambiar la configuración base ni el modo de pricing.
              </p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="space-y-2 block">
                <span className="text-sm font-semibold text-slate-700">Asesora</span>
                <select
                  value={asesoraSeleccionadaId}
                  onChange={(event) => setAsesoraSeleccionadaId(event.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecciona una asesora activa</option>
                  {asesorasDisponibles
                    .filter((asesora) => !asesora.asignada)
                    .map((asesora) => (
                      <option key={asesora.id} value={asesora.id}>
                        {asesora.nombre} {asesora.apellido} · {asesora.email}
                      </option>
                    ))}
                </select>
                {asesorasDisponibles.length === 0 && (
                  <span className="text-xs text-slate-500">No hay asesoras activas en el sistema. Crea una en Administradores antes de asignar.</span>
                )}
                {asesorasDisponibles.length > 0 && asesorasDisponibles.every((a) => a.asignada) && (
                  <span className="text-xs text-slate-500">Todas las asesoras activas ya están asignadas.</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => void handleAssignAsesora()}
                disabled={!asesoraSeleccionadaId || savingAsesoraId !== null}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAsesoraId ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Asignar
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Asesoras asignadas</h2>
              <p className="text-sm text-slate-500">{asesorasAsignadas.length} asignación{asesorasAsignadas.length === 1 ? '' : 'es'}</p>
            </div>
            <div className="divide-y divide-border">
              {asesorasAsignadas.map((asignacion) => {
                const usuario = asignacion.usuario;
                const saving = savingAsesoraId === asignacion.usuario_id;
                const userInactive = usuario ? !usuario.activo : false;
                return (
                  <div key={asignacion.id} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {usuario ? `${usuario.nombre} ${usuario.apellido}` : 'Usuario eliminado'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {usuario?.email ?? '—'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            asignacion.activo
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {asignacion.activo ? 'Activa' : 'Desactivada'}
                        </span>
                        {userInactive && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            title="El usuario está marcado como inactivo en Administradores. Aunque la asignación exista, no podrá entrar al panel."
                          >
                            <Lock className="h-2.5 w-2.5" />
                            Usuario inactivo
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleAsesora(asignacion)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        title={asignacion.activo ? 'Desactivar (mantiene la fila para reactivar luego)' : 'Reactivar acceso'}
                      >
                        {asignacion.activo ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        {asignacion.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUnassignAsesora(asignacion)}
                        disabled={saving}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Eliminar asignación (irreversible salvo reasignar)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {asesorasAsignadas.length === 0 && (
                <div className="px-6 py-8 text-sm text-slate-500">No hay asesoras asignadas. Selecciona una arriba para empezar.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {variantsModal && (
      <VariantsModal
        templateId={variantsModal.templateId}
        productName={variantsModal.productName}
        fallbackPrice={variantsModal.fallbackPrice}
        storefrontId={storefront?.id}
        open={Boolean(variantsModal)}
        onClose={() => setVariantsModal(null)}
      />
    )}
    </>
  );
}
