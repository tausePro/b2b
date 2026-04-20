// Tipos y constantes compartidas por el editor CMS modularizado.
// Mantener sincronizado con la API /api/landing/contenido.

export interface Seccion {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown>;
  imagen_url: string | null;
  orden: number;
  activo: boolean;
  updated_at: string;
  // Draft / publish (migración 031).
  // En el estado local, si tiene_borrador === true, los campos titulo / subtitulo /
  // contenido / imagen_url reflejan el BORRADOR (los valores publicados quedan en el
  // backend). Al publicar o descartar el backend devuelve el estado normalizado.
  tiene_borrador?: boolean;
  borrador_actualizado_en?: string | null;
}

export type TabId = 'landing' | 'seo' | 'paginas';

export const LANDING_IDS = [
  'hero',
  'categorias',
  'eficiencia',
  'clientes',
  'testimonios',
  'cta',
  'footer',
] as const;

export const PAGE_IDS = [
  'pagina_nosotros',
  'pagina_contacto',
  'pagina_faq',
  'pagina_terminos',
  'pagina_privacidad',
] as const;

export const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero Principal',
  categorias: 'Categorías',
  eficiencia: 'Eficiencia Operativa',
  clientes: 'Logos Clientes',
  testimonios: 'Testimonios',
  cta: 'Call to Action Final',
  footer: 'Footer',
  seo: 'SEO / Schema / AEO',
  pagina_nosotros: 'Sobre Nosotros',
  pagina_contacto: 'Contacto',
  pagina_faq: 'Preguntas Frecuentes',
  pagina_terminos: 'Términos y Condiciones',
  pagina_privacidad: 'Política de Privacidad',
  config_whatsapp: 'WhatsApp / Asesor',
};
