import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface LandingSeccion {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown>;
  imagen_url: string | null;
  orden: number;
  activo: boolean;
}

export async function getSeccion(id: string): Promise<LandingSeccion | null> {
  const { data } = await supabaseAdmin
    .from('landing_contenido')
    .select('*')
    .eq('id', id)
    .eq('activo', true)
    .single();

  return data as LandingSeccion | null;
}

export async function getSecciones(ids: string[]): Promise<Record<string, LandingSeccion>> {
  const { data } = await supabaseAdmin
    .from('landing_contenido')
    .select('*')
    .in('id', ids)
    .eq('activo', true);

  const result: Record<string, LandingSeccion> = {};
  for (const item of data || []) {
    result[item.id] = item as LandingSeccion;
  }
  return result;
}
