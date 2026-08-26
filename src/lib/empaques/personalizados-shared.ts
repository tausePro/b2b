export const EMPAQUES_PERSONALIZADOS_MAX_FILES = 3;
export const EMPAQUES_PERSONALIZADOS_MAX_FILE_BYTES = 3 * 1024 * 1024;
export const EMPAQUES_PERSONALIZADOS_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const EMPAQUES_PERSONALIZADOS_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type EmpaquesPersonalizadosFileType = (typeof EMPAQUES_PERSONALIZADOS_FILE_TYPES)[number];

export interface EmpaquesPersonalizadosArchivo {
  path: string;
  nombre: string;
  tipo: EmpaquesPersonalizadosFileType;
  tamano: number;
  signed_url?: string | null;
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
}
