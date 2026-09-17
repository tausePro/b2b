/**
 * SEO/AEO del storefront de Empaques.
 *
 * El canonical vive en el subdominio público. Las mismas vistas responden en
 * imprima.com.co/empaques por compatibilidad, pero buscadores y asistentes
 * deben consolidar señales en un único origen.
 */
import { EMPAQUES_PRODUCT_IMAGE_PX, buildEmpaquesProductImageUrl } from '@/lib/empaques/product-images';

export const EMPAQUES_CANONICAL_ORIGIN = 'https://empaques.imprima.com.co';
export const EMPAQUES_ORGANIZATION = {
  name: 'Imprima S.A.S',
  url: 'https://imprima.com.co',
  logo: 'https://imprima.com.co/logo-imprima-horizontal.png',
} as const;

type EmpaquesSeoProduct = {
  id: number;
  name: string;
  description_sale: string | false;
  descripcion_larga: string | null;
  seo_description: string | null;
  categ_id: [number, string] | false;
  default_code: string | false;
  has_image: boolean;
  image_version: string | null;
  image_url: string | null;
  price: number | null;
};

function assertPositiveInteger(value: number, message: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(message);
}

/** Canonical del listado. La búsqueda no genera canónicos propios. */
export function buildEmpaquesHomeCanonical(categoryId: number | null, page = 1): string {
  if (categoryId !== null) assertPositiveInteger(categoryId, 'Categoría inválida para el canonical.');
  assertPositiveInteger(page, 'Página inválida para el canonical.');
  const params = new URLSearchParams();
  if (categoryId !== null) params.set('categoria', String(categoryId));
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `${EMPAQUES_CANONICAL_ORIGIN}/${query ? `?${query}` : ''}`;
}

export function buildEmpaquesProductCanonical(productId: number): string {
  assertPositiveInteger(productId, 'Producto inválido para el canonical.');
  return `${EMPAQUES_CANONICAL_ORIGIN}/empaques/${productId}`;
}

export function buildEmpaquesPersonalizadosCanonical(): string {
  return `${EMPAQUES_CANONICAL_ORIGIN}/personalizados`;
}

export function getEmpaquesProductSeoDescription(product: EmpaquesSeoProduct): string {
  const description = product.seo_description
    || (typeof product.description_sale === 'string' ? product.description_sale.trim() : '')
    || product.descripcion_larga
    || '';
  const category = product.categ_id ? product.categ_id[1] : null;
  return (description || [product.name, category, 'Soluciones de Empaques Imprima'].filter(Boolean).join(' — ')).trim();
}

function absoluteProductImage(product: EmpaquesSeoProduct): string | null {
  const editorial = product.image_url?.trim();
  if (editorial) return editorial;
  if (!product.has_image) return null;
  return EMPAQUES_CANONICAL_ORIGIN
    + buildEmpaquesProductImageUrl(product.id, EMPAQUES_PRODUCT_IMAGE_PX.detail, product.image_version);
}

/**
 * Serializa JSON-LD para inyectarlo en un `<script type="application/ld+json">`.
 * Escapa `<`, `>` y `&` para impedir cierre anticipado del script.
 */
export function jsonLdScriptProps(data: Record<string, unknown>) {
  return {
    type: 'application/ld+json' as const,
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data)
        .replaceAll('<', '\\u003c')
        .replaceAll('>', '\\u003e')
        .replaceAll('&', '\\u0026'),
    },
  };
}

export function buildEmpaquesWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Empaques Imprima',
    url: `${EMPAQUES_CANONICAL_ORIGIN}/`,
    inLanguage: 'es-CO',
    publisher: {
      '@type': 'Organization',
      name: EMPAQUES_ORGANIZATION.name,
      url: EMPAQUES_ORGANIZATION.url,
      logo: EMPAQUES_ORGANIZATION.logo,
    },
  };
}

export function buildEmpaquesBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  if (items.length === 0) throw new Error('El breadcrumb requiere al menos un nivel.');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Product JSON-LD conservador: publica solo datos verificables del catálogo.
 * No declara disponibilidad de inventario (no hay consulta de stock) y solo
 * incluye oferta cuando existe un precio resuelto; el precio es antes de IVA.
 */
export function buildEmpaquesProductJsonLd(product: EmpaquesSeoProduct) {
  const url = buildEmpaquesProductCanonical(product.id);
  const image = absoluteProductImage(product);
  const category = product.categ_id ? product.categ_id[1] : null;
  const sku = typeof product.default_code === 'string' && product.default_code.trim()
    ? product.default_code.trim()
    : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: getEmpaquesProductSeoDescription(product),
    url,
    ...(image ? { image: [image] } : {}),
    ...(sku ? { sku } : {}),
    ...(category ? { category } : {}),
    brand: { '@type': 'Brand', name: 'Imprima' },
    ...(product.price !== null && Number.isFinite(product.price) && product.price > 0
      ? {
        offers: {
          '@type': 'Offer',
          url,
          price: Math.round(product.price),
          priceCurrency: 'COP',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: Math.round(product.price),
            priceCurrency: 'COP',
            valueAddedTaxIncluded: false,
          },
          seller: { '@type': 'Organization', name: EMPAQUES_ORGANIZATION.name, url: EMPAQUES_ORGANIZATION.url },
        },
      }
      : {}),
  };
}

export function buildEmpaquesPersonalizadosServiceJsonLd(config: { titulo: string; subtitulo: string; imagen_url: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: config.titulo,
    description: config.subtitulo,
    url: buildEmpaquesPersonalizadosCanonical(),
    serviceType: 'Impresión CMYK sobre bolsas kraft',
    areaServed: { '@type': 'Country', name: 'Colombia' },
    ...(config.imagen_url ? { image: [config.imagen_url] } : {}),
    provider: {
      '@type': 'Organization',
      name: EMPAQUES_ORGANIZATION.name,
      url: EMPAQUES_ORGANIZATION.url,
      logo: EMPAQUES_ORGANIZATION.logo,
    },
  };
}
