export const EMPAQUES_PERSONALIZADOS_MAX_FILES = 3;
export const EMPAQUES_PERSONALIZADOS_MAX_FILE_BYTES = 3 * 1024 * 1024;
export const EMPAQUES_PERSONALIZADOS_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const EMPAQUES_PERSONALIZADOS_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const EMPAQUES_TIFF_MAX_BYTES = 100 * 1024 * 1024;
export const EMPAQUES_TIFF_MAX_PIXELS = 64_000_000;
export const EMPAQUES_MIN_PPP = 150;
export const EMPAQUES_RECOMMENDED_PPP = 300;
export const EMPAQUES_REFERENCIA_SKUS = ['2300100156', '2300100157', '2300100158', '2300100112', '2300100042', '2300100026'] as const;
export const EMPAQUES_IMPRESION_SKUS = { una_cara: '2300100105', dos_caras: '2300100190', muestra: '2300100191' } as const;
export type EmpaquesCara = 'frente' | 'reverso';
export type EmpaquesModalidad = 'produccion' | 'muestra';
export interface EmpaquesReferencia {
  sku: string;
  nombre: string;
  alto_cm: number;
  ancho_cm: number;
  activo: boolean;
}

export interface EmpaquesArteValidacion {
  ancho_px: number;
  alto_px: number;
  ppp_efectivos: number;
  ancho_impresion_cm: number;
  alto_impresion_cm: number;
  proporcion_diferente: boolean;
  resolucion_recomendada: boolean;
}

export interface EmpaquesArteListo {
  id: string;
  token: string;
  cara: EmpaquesCara;
  sku: string;
  nombre: string;
  tamano: number;
  preview_url: string;
  expires_at: string;
  validacion: EmpaquesArteValidacion;
}

export function getEmpaquesImpresionSku(modalidad: EmpaquesModalidad, caras: number): string {
  if (!['produccion', 'muestra'].includes(modalidad) || (caras !== 1 && caras !== 2)) throw new Error('Selecciona una modalidad y una o dos caras.');
  return modalidad === 'muestra' ? EMPAQUES_IMPRESION_SKUS.muestra : caras === 1 ? EMPAQUES_IMPRESION_SKUS.una_cara : EMPAQUES_IMPRESION_SKUS.dos_caras;
}

export function getEmpaquesCaras(caras: number): EmpaquesCara[] {
  if (caras !== 1 && caras !== 2) throw new Error('Selecciona una o dos caras.');
  return caras === 1 ? ['frente'] : ['frente', 'reverso'];
}

export function calculateEmpaquesArte(anchoPx: number, altoPx: number, referencia: Pick<EmpaquesReferencia, 'alto_cm' | 'ancho_cm'>): EmpaquesArteValidacion {
  if (![anchoPx, altoPx].every((value) => Number.isSafeInteger(value) && value > 0)
    || ![referencia.alto_cm, referencia.ancho_cm].every((value) => Number.isFinite(value) && value > 0)
    || anchoPx * altoPx > EMPAQUES_TIFF_MAX_PIXELS) throw new Error('Las dimensiones del TIFF no son válidas o exceden el límite de píxeles.');
  const escala = Math.min(referencia.ancho_cm / anchoPx, referencia.alto_cm / altoPx);
  const ppp = 2.54 / escala;
  if (ppp < EMPAQUES_MIN_PPP) throw new Error('El arte no alcanza 150 ppp al tamaño de impresión. Sube el original con mayor resolución.');
  return {
    ancho_px: anchoPx, alto_px: altoPx,
    ppp_efectivos: Math.floor(ppp * 100) / 100,
    ancho_impresion_cm: Math.round(anchoPx * escala * 100) / 100,
    alto_impresion_cm: Math.round(altoPx * escala * 100) / 100,
    proporcion_diferente: Math.abs((anchoPx / altoPx) / (referencia.ancho_cm / referencia.alto_cm) - 1) > 0.01,
    resolucion_recomendada: ppp >= EMPAQUES_RECOMMENDED_PPP,
  };
}

export type EmpaquesPersonalizadosFileType = (typeof EMPAQUES_PERSONALIZADOS_FILE_TYPES)[number] | 'image/tiff';

export interface EmpaquesPersonalizadosArchivo {
  path: string;
  nombre: string;
  tipo: EmpaquesPersonalizadosFileType;
  tamano: number;
  signed_url?: string | null;
  cara?: EmpaquesCara;
  preview_path?: string | null;
  preview_url?: string | null;
  sha256?: string;
  validacion?: EmpaquesArteValidacion;
}

export interface EmpaquesPersonalizadosDetalle {
  id: string;
  lead_id: string;
  tipo_empaque: string;
  uso_producto: string;
  medida_largo: number | null;
  medida_ancho: number | null;
  medida_alto: number | null;
  unidad_medida: 'mm' | 'cm';
  material: string | null;
  impresion: string | null;
  cantidad: number;
  ciudad_entrega: string | null;
  fecha_requerida: string | null;
  comentarios: string | null;
  archivos: EmpaquesPersonalizadosArchivo[];
  created_at: string;
  referencia_sku?: string | null;
  impresion_sku?: string | null;
  modalidad?: EmpaquesModalidad | null;
  caras?: number | null;
  area_alto_cm?: number | null;
  area_ancho_cm?: number | null;
}
