import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const DEFAULT_MARGIN = 20.0;

export type ModoPricing = 'pricelist' | 'costo_margen';

interface MargenRow {
  odoo_categ_id: number | null;
  margen_porcentaje: number;
}

export interface MarginMap {
  byCateg: Map<number, number>;
  defaultMargin: number;
}

export interface PricingContext {
  modoPricing: ModoPricing;
  margins: MarginMap;
  overrides: Map<number, number>; // odoo_product_id → precio_override
}

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Carga todo el contexto de pricing para una empresa:
 * modo_pricing, márgenes por categoría y overrides manuales de precio.
 */
export async function loadPricingContext(empresaId: string): Promise<PricingContext> {
  const admin = getAdmin();

  const [configRes, margenesRes, overridesRes] = await Promise.all([
    admin
      .from('empresa_configs')
      .select('modo_pricing')
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    admin
      .from('margenes_venta')
      .select('odoo_categ_id, margen_porcentaje')
      .eq('empresa_id', empresaId),
    admin
      .from('precios_empresa_producto')
      .select('odoo_product_id, precio_override')
      .eq('empresa_id', empresaId),
  ]);

  // Modo pricing
  const modoPricing: ModoPricing =
    configRes.data?.modo_pricing === 'pricelist' ? 'pricelist' : 'costo_margen';

  // Márgenes
  const byCateg = new Map<number, number>();
  let defaultMargin = DEFAULT_MARGIN;
  if (margenesRes.data) {
    for (const row of margenesRes.data as MargenRow[]) {
      if (row.odoo_categ_id === null) {
        defaultMargin = row.margen_porcentaje;
      } else {
        byCateg.set(row.odoo_categ_id, row.margen_porcentaje);
      }
    }
  }

  // Overrides
  const overrides = new Map<number, number>();
  if (overridesRes.data) {
    for (const row of overridesRes.data as { odoo_product_id: number; precio_override: number }[]) {
      overrides.set(row.odoo_product_id, row.precio_override);
    }
  }

  return {
    modoPricing,
    margins: { byCateg, defaultMargin },
    overrides,
  };
}

/**
 * Carga los márgenes de venta para una empresa desde Supabase.
 * Retorna un mapa de categoría → margen y el margen por defecto.
 */
export async function loadMarginsForEmpresa(empresaId: string): Promise<MarginMap> {
  const admin = getAdmin();

  const { data, error } = await admin
    .from('margenes_venta')
    .select('odoo_categ_id, margen_porcentaje')
    .eq('empresa_id', empresaId);

  if (error || !data) {
    console.warn('[margins] Error cargando márgenes para empresa', empresaId, error?.message);
    return { byCateg: new Map(), defaultMargin: DEFAULT_MARGIN };
  }

  const rows = data as MargenRow[];
  const byCateg = new Map<number, number>();
  let defaultMargin = DEFAULT_MARGIN;

  for (const row of rows) {
    if (row.odoo_categ_id === null) {
      defaultMargin = row.margen_porcentaje;
    } else {
      byCateg.set(row.odoo_categ_id, row.margen_porcentaje);
    }
  }

  return { byCateg, defaultMargin };
}

/**
 * Obtiene el margen efectivo para una categoría de Odoo.
 */
export function getEffectiveMargin(margins: MarginMap, odooCategId: number | null): number {
  if (odooCategId !== null && margins.byCateg.has(odooCategId)) {
    return margins.byCateg.get(odooCategId)!;
  }
  return margins.defaultMargin;
}

/**
 * Calcula el precio de venta a partir del costo y el margen.
 * precio_venta = standard_price × (1 + margen / 100)
 */
export function calculateSellingPrice(standardPrice: number, marginPercent: number): number {
  if (!Number.isFinite(standardPrice) || standardPrice <= 0) return 0;
  return Math.round(standardPrice * (1 + marginPercent / 100));
}

/**
 * Resuelve el precio final de un producto según la jerarquía:
 * 1. Override manual (si existe) → gana siempre
 * 2. Costo+margen (si modo = 'costo_margen') → calcula standard_price × (1+margen%)
 * 3. Pricelist de Odoo (si modo = 'pricelist') → usa list_price tal cual
 * 4. Fallback → list_price original de Odoo
 */
export function resolveProductPrice(
  ctx: PricingContext,
  product: { id: number; list_price: number; standard_price: number; categ_id: [number, string] | number[] | false }
): number {
  // 1. Override manual
  if (ctx.overrides.has(product.id)) {
    return ctx.overrides.get(product.id)!;
  }

  // 2. Si modo = costo_margen, calcular
  if (ctx.modoPricing === 'costo_margen') {
    const categId = Array.isArray(product.categ_id) ? product.categ_id[0] : null;
    const margin = getEffectiveMargin(ctx.margins, categId as number | null);
    const sellingPrice = calculateSellingPrice(product.standard_price, margin);
    if (sellingPrice > 0) return sellingPrice;
  }

  // 3/4. Pricelist o fallback → list_price de Odoo
  return product.list_price;
}
