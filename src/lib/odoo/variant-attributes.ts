import type { ProductVariantsResult } from '@/lib/odoo/client';

export type VariantAttributes = ProductVariantsResult['attributes'];

export function buildVariantAttributeMap(attributes: VariantAttributes) {
  const values = new Map<number, { attrName: string; valueName: string; color: string | null }>();
  for (const attribute of attributes) {
    for (const value of attribute.values) {
      values.set(value.ptavId, {
        attrName: attribute.name,
        valueName: value.name,
        color: typeof value.htmlColor === 'string' ? value.htmlColor : null,
      });
    }
  }
  return values;
}
