import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Extrae solo los dígitos del NIT, eliminando puntos, guiones, espacios, etc.
 * Devuelve null si no hay dígitos.
 */
export function normalizeNitDigits(nit: string | null | undefined): string | null {
  if (!nit) return null;
  const digits = String(nit).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/**
 * NIT base sin dígito de verificación. En Colombia el NIT es típicamente
 * 9 dígitos + DV (1 dígito). Si el NIT tiene 10 dígitos, asumimos que el
 * último es el DV. Si tiene 9 o menos, no hay DV.
 */
export function nitWithoutDV(nit: string | null | undefined): string | null {
  const digits = normalizeNitDigits(nit);
  if (!digits) return null;
  if (digits.length === 10) return digits.slice(0, 9);
  return digits;
}

/**
 * Compara dos NITs ignorando puntos, guiones y dígito de verificación.
 * Devuelve true si el NIT base (sin DV) es el mismo.
 */
export function nitsAreEquivalent(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const baseA = nitWithoutDV(a);
  const baseB = nitWithoutDV(b);
  if (!baseA || !baseB) return false;
  return baseA === baseB;
}

/**
 * Normaliza un nombre de empresa para comparación: lowercase, sin tildes,
 * sin caracteres no alfanuméricos, colapsando espacios.
 *
 * Ej: "VIAJES COLEGIOS Y TURISMO S.A." -> "viajes colegios y turismo sa"
 */
export function normalizeNombreEmpresa(nombre: string | null | undefined): string {
  if (!nombre) return '';
  return String(nombre)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DuplicateCandidate = {
  id: string;
  nombre: string;
  nit: string | null;
  odoo_partner_id: number | null;
  activa: boolean;
  match_reason: 'nit' | 'nombre';
};

/**
 * Busca empresas existentes que puedan ser duplicados de un partner que
 * se quiere importar. Considera duplicado si:
 *   - El NIT base (sin DV) coincide, o
 *   - El nombre normalizado es exactamente igual.
 *
 * Excluye la empresa cuyo `odoo_partner_id` coincide con el del partner
 * que se quiere importar (esa la maneja el flujo existente como
 * "ya importada").
 */
export async function findEmpresaDuplicates(
  supabaseAdmin: SupabaseClient,
  params: {
    nit: string | null;
    nombre: string;
    excludeOdooPartnerId: number;
  }
): Promise<DuplicateCandidate[]> {
  const nitBase = nitWithoutDV(params.nit);
  const nombreNorm = normalizeNombreEmpresa(params.nombre);

  if (!nitBase && !nombreNorm) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('empresas')
    .select('id, nombre, nit, odoo_partner_id, activa')
    .neq('odoo_partner_id', params.excludeOdooPartnerId);

  if (error || !data) {
    return [];
  }

  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  for (const empresa of data) {
    const empresaNitBase = nitWithoutDV(empresa.nit as string | null);
    const empresaNombreNorm = normalizeNombreEmpresa(empresa.nombre as string | null);

    let reason: 'nit' | 'nombre' | null = null;
    if (nitBase && empresaNitBase && nitBase === empresaNitBase) {
      reason = 'nit';
    } else if (nombreNorm && empresaNombreNorm && nombreNorm === empresaNombreNorm) {
      reason = 'nombre';
    }

    if (reason && !seen.has(empresa.id)) {
      seen.add(empresa.id);
      candidates.push({
        id: String(empresa.id),
        nombre: String(empresa.nombre),
        nit: empresa.nit ? String(empresa.nit) : null,
        odoo_partner_id: empresa.odoo_partner_id == null ? null : Number(empresa.odoo_partner_id),
        activa: Boolean(empresa.activa),
        match_reason: reason,
      });
    }
  }

  return candidates;
}
