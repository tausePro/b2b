/**
 * Tamaños que Odoo materializa para `image.mixin` (product.template):
 * image_128, image_256, image_512, image_1024 e image_1920. Odoo nunca
 * escala hacia arriba: si el original es más pequeño, todos devuelven el
 * original.
 */
export const EMPAQUES_ODOO_IMAGE_SIZES = [128, 256, 512, 1024, 1920] as const;
export type EmpaquesOdooImageSize = typeof EMPAQUES_ODOO_IMAGE_SIZES[number];

export type EmpaquesProductImageSize = 'card' | 'detail';

/**
 * Resolución pedida a Odoo por vista. Las tarjetas se renderizan entre ~290 y
 * ~360 px CSS (hasta ~1080 px físicos en pantallas 3x) y el detalle ocupa
 * ~55vw; next/image genera desde aquí el srcset final.
 */
export const EMPAQUES_PRODUCT_IMAGE_PX: Record<EmpaquesProductImageSize, EmpaquesOdooImageSize> = {
  card: 1024,
  detail: 1920,
};

export const EMPAQUES_PRODUCT_IMAGE_ENDPOINT = '/api/empaques/imagen';

type EmpaquesProductImageFields = {
  id: number;
  image_url?: string | null;
  has_image?: boolean;
  image_version?: string | null;
};

type EmpaquesInlineImageFields = {
  image_url?: string | null;
  image_1024?: string | false;
};

export function selectEmpaquesShowcaseCategories<T extends { id: number; name: string; orden: number; destacado: boolean; children: T[] }>(categories: T[]): T[] {
  const all: T[] = [];
  const seen = new Set<number>();
  const visit = (category: T) => {
    if (seen.has(category.id)) return;
    seen.add(category.id);
    all.push(category);
    category.children.forEach(visit);
  };
  categories.forEach(visit);
  const featured = all.filter((category) => category.destacado);
  return (featured.length ? featured : all)
    .sort((a, b) => a.orden - b.orden || a.name.localeCompare(b.name, 'es'))
    .slice(0, 3);
}

export function buildEmpaquesCategoryHref(categoryId: number | null, search = '', page = 1, basePath: '/' | '/empaques' = '/empaques'): string {
  if (categoryId !== null && (!Number.isSafeInteger(categoryId) || categoryId <= 0)) throw new Error('Categoría inválida.');
  if (!Number.isSafeInteger(page) || page < 1 || !['/', '/empaques'].includes(basePath)) throw new Error('Ruta de catálogo inválida.');
  const params = new URLSearchParams();
  if (categoryId !== null) params.set('categoria', String(categoryId));
  if (search.trim()) params.set('q', search.trim());
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ''}#productos`;
}

export interface EmpaquesCategoryPresentation {
  ajuste: 'cover' | 'contain';
  posicion_x: number;
  posicion_y: number;
  opacidad: number;
  sombra: number;
}

export function normalizeCategoryPresentation(raw: unknown, defaultX = 50): EmpaquesCategoryPresentation {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const percentage = (key: string, fallback: number) => typeof source[key] === 'number' && Number.isFinite(source[key])
    ? Math.round(Math.max(0, Math.min(100, source[key]))) : fallback;
  return {
    ajuste: source.ajuste === 'contain' ? 'contain' : 'cover',
    posicion_x: percentage('posicion_x', defaultX), posicion_y: percentage('posicion_y', 50),
    opacidad: percentage('opacidad', 60), sombra: percentage('sombra', 85),
  };
}

export function readCategoryPresentation(extra: unknown): EmpaquesCategoryPresentation | null {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null;
  const value = (extra as Record<string, unknown>).imagen_presentacion;
  return value && typeof value === 'object' && !Array.isArray(value) ? normalizeCategoryPresentation(value) : null;
}

export function mergeCategoryPresentation(extra: unknown, raw: unknown): Record<string, unknown> {
  const previous = extra && typeof extra === 'object' && !Array.isArray(extra) ? extra as Record<string, unknown> : {};
  if (raw === null) {
    const result = { ...previous };
    delete result.imagen_presentacion;
    return result;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('El encuadre de imagen no es válido.');
  const value = raw as Record<string, unknown>;
  if (typeof value.ajuste !== 'string' || !['cover', 'contain'].includes(value.ajuste)
    || ['posicion_x', 'posicion_y', 'opacidad', 'sombra'].some((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 100)) {
    throw new Error('El ajuste debe ser imagen completa o recorte y los valores deben estar entre 0 y 100.');
  }
  return { ...previous, imagen_presentacion: normalizeCategoryPresentation(value) };
}

export function categoryImageStyle(presentation: EmpaquesCategoryPresentation) {
  return { objectFit: presentation.ajuste, objectPosition: `${presentation.posicion_x}% ${presentation.posicion_y}%`, opacity: presentation.opacidad / 100 };
}

export function categoryImageOverlay(presentation: EmpaquesCategoryPresentation): string {
  const opacity = presentation.sombra / 100;
  return `linear-gradient(to top, rgba(0,0,0,${opacity}), rgba(0,0,0,${opacity * 25 / 85}), transparent)`;
}

export function getEmpaquesCategoryImageSrc(category: { imagen_url: string | null }): string | null {
  return category.imagen_url?.trim() || null;
}

export function getBase64Mime(value: string) {
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

/**
 * Con el contexto Odoo `bin_size: true` los binarios llegan como tamaño
 * legible (`"30.17 Kb"`) o `false`; sin él llega el base64. En ambos casos un
 * string no vacío significa que el producto tiene fotografía.
 */
export function hasOdooBinary(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Token de versión para invalidar caché CDN/optimizador cuando cambia la foto
 * en Odoo. `write_date` llega como `YYYY-MM-DD HH:MM:SS`; se conservan solo
 * los dígitos para no depender de la zona horaria del servidor.
 */
export function toEmpaquesImageVersion(writeDate: unknown): string | null {
  if (typeof writeDate !== 'string') return null;
  const digits = writeDate.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function parseEmpaquesImageSize(value: string | null): EmpaquesOdooImageSize | null {
  if (value === null) return EMPAQUES_PRODUCT_IMAGE_PX.card;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return EMPAQUES_ODOO_IMAGE_SIZES.find((size) => size === parsed) ?? null;
}

export function buildEmpaquesProductImageUrl(productId: number, size: EmpaquesOdooImageSize, version?: string | null) {
  const params = new URLSearchParams({ s: String(size) });
  if (version) params.set('v', version);
  return `${EMPAQUES_PRODUCT_IMAGE_ENDPOINT}/${productId}?${params.toString()}`;
}

export function hasEmpaquesEditorialImage(product: Pick<EmpaquesProductImageFields, 'image_url'>) {
  return typeof product.image_url === 'string' && product.image_url.trim().length > 0;
}

export function getEmpaquesProductImageSrc(
  product: EmpaquesProductImageFields,
  size: EmpaquesProductImageSize = 'card',
) {
  if (hasEmpaquesEditorialImage(product)) {
    return product.image_url!.trim();
  }

  if (!product.has_image) return null;
  return buildEmpaquesProductImageUrl(product.id, EMPAQUES_PRODUCT_IMAGE_PX[size], product.image_version);
}

/**
 * Variante inline para flujos que ya traen el binario de Odoo en la misma
 * consulta (personalizados): prioriza la imagen editorial y cae al data URL.
 */
export function getEmpaquesInlineImageSrc(product: EmpaquesInlineImageFields) {
  if (hasEmpaquesEditorialImage(product)) {
    return product.image_url!.trim();
  }
  return asDataUrl(product.image_1024);
}
