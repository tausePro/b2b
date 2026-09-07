import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeLandingConfig } from './landing-config-shared';

export const EMPAQUES_ART_BUCKET = 'empaques-solicitudes';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export class PersonalizadosError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'INVALID_REQUEST') { super(message); }
}

export function personalizacionAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function personalizacionJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}

export function personalizacionError(error: unknown) {
  if (error instanceof PersonalizadosError) return personalizacionJson({ error: error.message, code: error.code }, error.status);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
    return personalizacionJson({ error: 'El configurador está en actualización. Intenta más tarde.', code: 'MIGRATION_REQUIRED' }, 503);
  }
  const errors: Record<string, [number, string]> = {
    PT400: [400, 'Revisa las especificaciones de la solicitud.'],
    PT403: [403, 'No se pudo autorizar el archivo. Vuelve a subirlo.'],
    PT409: [409, 'El archivo ya se utilizó o las especificaciones cambiaron. Revisa si la solicitud ya fue recibida.'],
    PT410: [410, 'La autorización del archivo expiró. Vuelve a subirlo.'],
    PT429: [429, 'Alcanzaste el límite temporal de cargas. Intenta más tarde.'],
  };
  if (errors[code]) return personalizacionJson({ error: errors[code][1], code }, errors[code][0]);
  console.error('[Empaques personalizados]', code || 'INTERNAL_ERROR');
  return personalizacionJson({ error: 'No se pudo procesar la solicitud. Intenta nuevamente.', code: 'INTERNAL_ERROR' }, 500);
}

export async function readPersonalizacionJson(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new PersonalizadosError(415, 'Actualiza la página para usar el configurador de archivos TIFF.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new PersonalizadosError(400, 'La solicitud está vacía.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16 * 1024) {
        await reader.cancel();
        throw new PersonalizadosError(413, 'La solicitud es demasiado grande. Los TIFF se cargan por separado.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON');
    return value;
  } catch {
    throw new PersonalizadosError(400, 'La solicitud no tiene un formato válido.');
  }
}

export function hashPersonalizacionRequest(request: NextRequest) {
  const forwarded = (process.env.VERCEL ? request.headers.get('x-vercel-forwarded-for') : null) ?? request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`empaques-tiff:${ip}`).digest('hex');
}

export function hashArteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function validArteToken(token: unknown, hash: unknown): boolean {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) || typeof hash !== 'string' || !TOKEN_PATTERN.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashArteToken(token), 'hex'), Buffer.from(hash, 'hex'));
}

export async function loadPersonalizacionReferencia(admin: ReturnType<typeof personalizacionAdmin>, sku: unknown) {
  const { data: storefront, error } = await admin.from('storefront_configs')
    .select('id, activo, configuracion_extra').eq('slug', 'empaques').maybeSingle();
  if (error) throw error;
  if (!storefront?.activo) throw new PersonalizadosError(404, 'El configurador no está disponible.');
  const config = normalizeLandingConfig(storefront.configuracion_extra).personalizados;
  if (!config.activo) throw new PersonalizadosError(404, 'El configurador no está disponible.');
  if (!config.referencias.length) throw new PersonalizadosError(503, 'El configurador está en actualización. Intenta más tarde.', 'MIGRATION_REQUIRED');
  const referencia = config.referencias.find((item) => item.sku === sku && item.activo);
  if (!referencia) throw new PersonalizadosError(400, 'Selecciona una referencia de empaque disponible.');
  return { storefrontId: storefront.id as string, config, referencia };
}
