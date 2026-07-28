type EmpaquesProductImageFields = {
  image_url?: string | null;
  image_128?: string | false;
  image_1920?: string | false;
};

export type EmpaquesProductImageSize = 'card' | 'detail';

function getBase64Mime(value: string) {
  if (value.startsWith('/9j/')) return 'image/jpeg';
  if (value.startsWith('iVBORw0KGgo')) return 'image/png';
  if (value.startsWith('R0lGOD')) return 'image/gif';
  if (value.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

function asDataUrl(value: string | false | undefined) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return `data:${getBase64Mime(value)};base64,${value}`;
}

export function hasEmpaquesEditorialImage(product: EmpaquesProductImageFields) {
  return typeof product.image_url === 'string' && product.image_url.trim().length > 0;
}

export function getEmpaquesProductImageSrc(
  product: EmpaquesProductImageFields,
  size: EmpaquesProductImageSize = 'card',
) {
  if (hasEmpaquesEditorialImage(product)) {
    return product.image_url!.trim();
  }

  if (size === 'detail') {
    return asDataUrl(product.image_1920) ?? asDataUrl(product.image_128);
  }

  return asDataUrl(product.image_128);
}
