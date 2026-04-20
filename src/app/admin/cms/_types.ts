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
