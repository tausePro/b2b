/**
 * Tipos y normalizadores client-safe de la landing config de Empaques.
 * Este módulo NO debe importar nada de server-only ni hacer IO. El módulo
 * `./landing-config.ts` lo re-exporta y agrega los helpers de servidor.
 */

export const LANDING_BENEFIT_ICONS = ['sparkles', 'leaf', 'route', 'package', 'box', 'building'] as const;
export type LandingBenefitIcon = (typeof LANDING_BENEFIT_ICONS)[number];

export interface EmpaquesLandingHero {
  titulo_pre: string;
  titulo_destacado: string;
  subtitulo: string;
  cta_primario_texto: string;
  cta_secundario_texto: string;
  mensaje_lead: string;
  imagen_url: string | null;
}

export interface EmpaquesLandingBenefitItem {
  icon: LandingBenefitIcon;
  titulo: string;
  texto: string;
}

export interface EmpaquesLandingBenefits {
  eyebrow: string;
  titulo: string;
  subtitulo: string;
  items: EmpaquesLandingBenefitItem[];
}

export interface EmpaquesLandingConfig {
  descripcion: string;
  hero: EmpaquesLandingHero;
  ventajas: EmpaquesLandingBenefits;
}

export const DEFAULT_LANDING_CONFIG: EmpaquesLandingConfig = {
  descripcion: 'Storefront público de la unidad de negocio Empaques.',
  hero: {
    titulo_pre: 'Soluciones de Empaque que',
    titulo_destacado: 'Impulsan tu Marca',
    subtitulo:
      'Diseño estratégico, sostenibilidad y producción a escala para empresas que exigen calidad premium en cada entrega.',
    cta_primario_texto: 'Ver Catálogo Corporativo',
    cta_secundario_texto: 'Hablar con un Asesor',
    mensaje_lead: 'Estoy interesado en soluciones de empaque para mi empresa.',
    imagen_url: null,
  },
  ventajas: {
    eyebrow: 'Ventaja Competitiva',
    titulo: 'Por qué elegir Imprima B2B',
    subtitulo:
      'Desarrollamos sistemas de empaque que optimizan tu cadena de suministro y elevan la percepción de tu marca.',
    items: [
      {
        icon: 'sparkles',
        titulo: 'Personalización Total',
        texto:
          'Desde dimensiones exactas hasta acabados especiales para que el empaque responda a tu producto y operación.',
      },
      {
        icon: 'leaf',
        titulo: 'Compromiso Sostenible',
        texto:
          'Alternativas y materiales pensados para reducir impacto sin comprometer presentación ni resistencia.',
      },
      {
        icon: 'route',
        titulo: 'Logística Nacional Optimizada',
        texto:
          'Acompañamiento comercial para abastecer necesidades recurrentes, proyectos especiales y operación nacional.',
      },
    ],
  },
};

function asString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asNullableUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asIcon(value: unknown, fallback: LandingBenefitIcon): LandingBenefitIcon {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return (LANDING_BENEFIT_ICONS as readonly string[]).includes(normalized)
    ? (normalized as LandingBenefitIcon)
    : fallback;
}

function normalizeHero(raw: unknown): EmpaquesLandingHero {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    titulo_pre: asString(source.titulo_pre, DEFAULT_LANDING_CONFIG.hero.titulo_pre),
    titulo_destacado: asString(source.titulo_destacado, DEFAULT_LANDING_CONFIG.hero.titulo_destacado),
    subtitulo: asString(source.subtitulo, DEFAULT_LANDING_CONFIG.hero.subtitulo),
    cta_primario_texto: asString(source.cta_primario_texto, DEFAULT_LANDING_CONFIG.hero.cta_primario_texto),
    cta_secundario_texto: asString(source.cta_secundario_texto, DEFAULT_LANDING_CONFIG.hero.cta_secundario_texto),
    mensaje_lead: asString(source.mensaje_lead, DEFAULT_LANDING_CONFIG.hero.mensaje_lead),
    imagen_url: asNullableUrl(source.imagen_url),
  };
}

function normalizeBenefitItem(raw: unknown, fallback: EmpaquesLandingBenefitItem): EmpaquesLandingBenefitItem {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    icon: asIcon(source.icon, fallback.icon),
    titulo: asString(source.titulo, fallback.titulo),
    texto: asString(source.texto, fallback.texto),
  };
}

function normalizeBenefits(raw: unknown): EmpaquesLandingBenefits {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const defaults = DEFAULT_LANDING_CONFIG.ventajas;
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items: EmpaquesLandingBenefitItem[] = defaults.items.map((fallback, index) =>
    normalizeBenefitItem(rawItems[index], fallback),
  );
  return {
    eyebrow: asString(source.eyebrow, defaults.eyebrow),
    titulo: asString(source.titulo, defaults.titulo),
    subtitulo: asString(source.subtitulo, defaults.subtitulo),
    items,
  };
}

/**
 * Normaliza la sección `landing` de `storefront_configs.configuracion_extra`.
 * Garantiza que todos los campos existan y tengan valores válidos. Si la
 * config viene incompleta o corrupta, se usan los defaults para no romper la
 * landing pública.
 */
export function normalizeLandingConfig(extra: unknown): EmpaquesLandingConfig {
  const source = (extra && typeof extra === 'object') ? extra as Record<string, unknown> : {};
  return {
    descripcion: asString(source.descripcion, DEFAULT_LANDING_CONFIG.descripcion),
    hero: normalizeHero(source.landing && typeof source.landing === 'object'
      ? (source.landing as Record<string, unknown>).hero
      : undefined),
    ventajas: normalizeBenefits(source.landing && typeof source.landing === 'object'
      ? (source.landing as Record<string, unknown>).ventajas
      : undefined),
  };
}

/**
 * Forma serializable que se guarda en `configuracion_extra`. La descripción
 * vive en el nivel raíz por compatibilidad con el campo legacy (ver migración
 * 037). Hero y ventajas viven bajo `landing` para agrupar la edición visual.
 */
export function landingConfigToExtra(config: EmpaquesLandingConfig, currentExtra: Record<string, unknown> = {}) {
  return {
    ...currentExtra,
    descripcion: config.descripcion,
    landing: {
      hero: config.hero,
      ventajas: config.ventajas,
    },
  };
}
