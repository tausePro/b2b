import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const DEFAULT_MARGIN = 20.0;

interface MargenRow {
  odoo_categ_id: number | null;
  margen_porcentaje: number;
}

export interface MarginMap {
  byCateg: Map<number, number>;
  defaultMargin: number;
}

/**
 * Carga los márgenes de venta para una empresa desde Supabase.
 * Retorna un mapa de categoría → margen y el margen por defecto.
 */
export async function loadMarginsForEmpresa(empresaId: string): Promise<MarginMap> {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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
 * Busca primero por categoría exacta, luego cae al margen por defecto.
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
