import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { LANDING_CACHE_TAG } from '@/lib/landing/getContenido';
import { obtenerContextoCms } from '@/lib/landing/authCms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SeccionRow {
  id: string;
  tiene_borrador: boolean | null;
  titulo_borrador: string | null;
  subtitulo_borrador: string | null;
  contenido_borrador: Record<string, unknown> | null;
  imagen_url_borrador: string | null;
}

/**
 * POST /api/landing/contenido/[id]/publicar
 * Promueve el borrador de la sección a contenido publicado.
 * - Copia *_borrador → campos públicos (el trigger 030 snapshotea el estado previo).
 * - Limpia las columnas *_borrador y la flag tiene_borrador.
 * - Invalida la cache de landing.
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

    // 1. Leer estado actual del borrador
    const { data: current, error: errSel } = await supabaseAdmin
      .from('landing_contenido')
      .select(
        'id, tiene_borrador, titulo_borrador, subtitulo_borrador, contenido_borrador, imagen_url_borrador'
      )
      .eq('id', id)
      .single<SeccionRow>();

    if (errSel || !current) {
      return NextResponse.json({ error: 'Sección no encontrada' }, { status: 404 });
    }

    if (!current.tiene_borrador) {
      return NextResponse.json(
        { error: 'No hay borrador pendiente en esta sección' },
        { status: 400 }
      );
    }

    // 2. Promover borrador → publicado (single UPDATE, dispara trigger 030)
    const { data: seccion, error: errUpdate } = await supabaseAdmin
      .from('landing_contenido')
      .update({
        titulo: current.titulo_borrador,
        subtitulo: current.subtitulo_borrador,
        contenido: current.contenido_borrador,
        imagen_url: current.imagen_url_borrador,
        actualizado_por: ctx.authId,
        updated_at: new Date().toISOString(),
        // Limpiar borrador
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

    if (errUpdate) throw errUpdate;

    // 3. Invalidar cache pública
    revalidateTag(LANDING_CACHE_TAG, 'max');

    return NextResponse.json({ seccion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al publicar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
