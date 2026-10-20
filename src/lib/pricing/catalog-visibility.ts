import type { PricelistRuleSet } from '@/lib/odoo/client';

/** null admite toda la familia; [] no admite variantes. Las reglas ya deben estar vigentes. */
export function getPricelistVariantIds(
  rules: PricelistRuleSet,
  templateId: number,
  categoryId: number | null,
): number[] | null {
  if (rules.global.length > 0 || rules.byTemplate.has(templateId)
    || (categoryId !== null && rules.byCategory.has(categoryId))) return null;
  return rules.variantsByTemplate.get(templateId) ?? [];
}

export function matchesCatalogProductSearch(
  product: { name: string; default_code: string | false; pricelist_variant_codes?: string[] },
  search: string,
): boolean {
  const term = search.trim().toLocaleLowerCase('es');
  if (!term || product.name.toLocaleLowerCase('es').includes(term)) return true;
  const codes = product.pricelist_variant_codes ?? (product.default_code ? [product.default_code] : []);
  return codes.some(code => code.toLocaleLowerCase('es').includes(term));
}
