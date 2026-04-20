import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { obtenerContextoCms } from '@/lib/landing/authCms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/landing/contenido/[id]/descartar-borrador
 * Descarta el borrador pendiente de una sección sin tocar el contenido publicado.
 * No invalida cache porque el sitio público no se ve afectado.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await obtenerContextoCms();
    if (!ctx) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID de sección requerido' }, { status: 400 });
    }

    const { data: seccion, error } = await supabaseAdmin
      .from('landing_contenido')
      .update({
        titulo_borrador: null,
        subtitulo_borrador: null,
        contenido_borrador: null,
        imagen_url_borrador: null,
        tiene_borrador: false,
        borrador_actualizado_en: null,
        borrador_actualizado_por: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ seccion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al descartar borrador';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
