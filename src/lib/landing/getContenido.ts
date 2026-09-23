import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { INTERNAL_LEAD_NOTIFICATION_SECTION, PUBLIC_LANDING_FIELDS, isInternalLandingSection } from './privateSections';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const LANDING_CACHE_TAG = 'landing';
export const LANDING_CACHE_REVALIDATE = 300; // 5 min

export interface LandingSeccion {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown>;
  imagen_url: string | null;
  orden: number;
  activo: boolean;
}

const fetchSeccion = unstable_cache(
  async (id: string): Promise<LandingSeccion | null> => {
    const { data } = await supabaseAdmin
      .from('landing_contenido')
      .select(PUBLIC_LANDING_FIELDS)
      .neq('id', INTERNAL_LEAD_NOTIFICATION_SECTION)
      .eq('id', id)
      .eq('activo', true)
      .single();
    return data as LandingSeccion | null;
  },
  ['landing-seccion-public-v2'],
  { revalidate: LANDING_CACHE_REVALIDATE, tags: [LANDING_CACHE_TAG] }
);

const fetchSecciones = unstable_cache(
  async (ids: string[]): Promise<Record<string, LandingSeccion>> => {
    const { data } = await supabaseAdmin
      .from('landing_contenido')
      .select(PUBLIC_LANDING_FIELDS)
      .neq('id', INTERNAL_LEAD_NOTIFICATION_SECTION)
      .in('id', ids)
      .eq('activo', true);

    const result: Record<string, LandingSeccion> = {};
    for (const item of data || []) {
      result[item.id] = item as LandingSeccion;
    }
    return result;
  },
  ['landing-secciones-public-v2'],
  { revalidate: LANDING_CACHE_REVALIDATE, tags: [LANDING_CACHE_TAG] }
);

const fetchSeccionesActivas = unstable_cache(
  async (): Promise<Record<string, LandingSeccion>> => {
    const { data } = await supabaseAdmin
      .from('landing_contenido')
      .select(PUBLIC_LANDING_FIELDS)
      .neq('id', INTERNAL_LEAD_NOTIFICATION_SECTION)
      .eq('activo', true)
      .order('orden');
    const result: Record<string, LandingSeccion> = {};
    for (const item of data || []) {
      result[item.id] = item as LandingSeccion;
    }
    return result;
  },
  ['landing-secciones-activas-public-v2'],
  { revalidate: LANDING_CACHE_REVALIDATE, tags: [LANDING_CACHE_TAG] }
);

export async function getSeccion(id: string): Promise<LandingSeccion | null> {
  if (isInternalLandingSection(id)) return null;
  return fetchSeccion(id);
}

export async function getSecciones(ids: string[]): Promise<Record<string, LandingSeccion>> {
  return fetchSecciones(ids);
}

export async function getSeccionesActivas(): Promise<Record<string, LandingSeccion>> {
  return fetchSeccionesActivas();
}
