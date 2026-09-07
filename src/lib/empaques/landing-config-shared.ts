/**
 * Tipos y normalizadores client-safe de la landing config de Empaques.
 * Este módulo NO debe importar nada de server-only ni hacer IO. El módulo
 * `./landing-config.ts` lo re-exporta y agrega los helpers de servidor.
 */

import { EMPAQUES_REFERENCIA_SKUS, type EmpaquesReferencia } from './personalizados-shared';

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
  overlay_color: string;
  overlay_opacity: number;
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

export interface EmpaquesPersonalizadosConfig {
  activo: boolean;
  eyebrow: string;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  cta_texto: string;
  mensaje_whatsapp: string;
  imagen_url: string | null;
  tipos_empaque: string[];
  materiales: string[];
  impresiones: string[];
  referencias: EmpaquesReferencia[];
}

export interface EmpaquesLandingConfig {
  descripcion: string;
  hero: EmpaquesLandingHero;
  ventajas: EmpaquesLandingBenefits;
  personalizados: EmpaquesPersonalizadosConfig;
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
    overlay_color: '#0f172a',
    overlay_opacity: 70,
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
  personalizados: {
    activo: true,
    eyebrow: 'Soluciones a medida',
    titulo: 'Empaques Personalizados',
    subtitulo: 'Diseño estructural y gráfico a medida para destacar tu producto y responder a las necesidades de tu operación.',
    descripcion: 'Configura las especificaciones iniciales de tu proyecto para que nuestro equipo prepare una propuesta técnica y comercial.',
    cta_texto: 'Configurar mi empaque',
    mensaje_whatsapp: 'Hola, acabo de enviar una solicitud de empaque personalizado y quiero continuar con la asesoría.',
    imagen_url: null,
    tipos_empaque: [],
    materiales: [],
    impresiones: [],
    referencias: [],
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

function asHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function asPercentage(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, 80))
      .filter(Boolean),
  )).slice(0, 30);
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
    overlay_color: asHexColor(source.overlay_color, DEFAULT_LANDING_CONFIG.hero.overlay_color),
    overlay_opacity: asPercentage(source.overlay_opacity, DEFAULT_LANDING_CONFIG.hero.overlay_opacity),
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

function normalizeReferencias(raw: unknown): EmpaquesReferencia[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (typeof row.sku !== 'string' || !(EMPAQUES_REFERENCIA_SKUS as readonly string[]).includes(row.sku) || seen.has(row.sku)
      || typeof row.nombre !== 'string' || !row.nombre.trim()
      || typeof row.alto_cm !== 'number' || typeof row.ancho_cm !== 'number'
      || ![row.alto_cm, row.ancho_cm].every((size) => Number.isFinite(size) && size > 0 && size <= 100)) return [];
    seen.add(row.sku);
    return [{ sku: row.sku, nombre: row.nombre.trim().slice(0, 120), alto_cm: row.alto_cm, ancho_cm: row.ancho_cm, activo: row.activo === true }];
  });
}

function normalizePersonalizados(raw: unknown): EmpaquesPersonalizadosConfig {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const defaults = DEFAULT_LANDING_CONFIG.personalizados;
  return {
    activo: asBoolean(source.activo, defaults.activo),
    eyebrow: asString(source.eyebrow, defaults.eyebrow),
    titulo: asString(source.titulo, defaults.titulo),
    subtitulo: asString(source.subtitulo, defaults.subtitulo),
    descripcion: asString(source.descripcion, defaults.descripcion),
    cta_texto: asString(source.cta_texto, defaults.cta_texto),
    mensaje_whatsapp: asString(source.mensaje_whatsapp, defaults.mensaje_whatsapp),
    imagen_url: asNullableUrl(source.imagen_url),
    tipos_empaque: asStringList(source.tipos_empaque, defaults.tipos_empaque),
    materiales: asStringList(source.materiales, defaults.materiales),
    impresiones: asStringList(source.impresiones, defaults.impresiones),
    referencias: normalizeReferencias(source.referencias),
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
    personalizados: normalizePersonalizados(source.landing && typeof source.landing === 'object'
      ? (source.landing as Record<string, unknown>).personalizados
      : undefined),
  };
}

/**
 * Forma serializable que se guarda en `configuracion_extra`. La descripción
 * vive en el nivel raíz por compatibilidad con el campo legacy (ver migración
 * 037). Hero, ventajas y personalizados viven bajo `landing` para agrupar la edición visual.
 */
export function landingConfigToExtra(config: EmpaquesLandingConfig, currentExtra: Record<string, unknown> = {}) {
  return {
    ...currentExtra,
    descripcion: config.descripcion,
    landing: {
      hero: config.hero,
      ventajas: config.ventajas,
      personalizados: config.personalizados,
    },
  };
}
