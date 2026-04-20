import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { LANDING_CACHE_TAG } from '@/lib/landing/getContenido';
import { obtenerContextoCms } from '@/lib/landing/authCms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get('all') === 'true';

    let query = supabaseAdmin
      .from('landing_contenido')
      .select('*')
      .order('orden');

    if (!showAll) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const contenido: Record<string, unknown> = {};
    for (const item of data || []) {
      contenido[item.id] = item;
    }

    return NextResponse.json({ contenido });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar contenido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: guarda cambios como BORRADOR (no afecta al sitio público hasta publicar).
// Los campos editoriales (titulo/subtitulo/contenido/imagen_url) se escriben en
// las columnas *_borrador; los metadatos de visibilidad (activo) y orden se
// aplican directo al publicado porque son toggles, no edición de contenido.
export async function PUT(request: NextRequest) {
  try {
    const ctx = await obtenerContextoCms();
    if (!ctx) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { id, titulo, subtitulo, contenido, imagen_url, orden, activo } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID de sección requerido' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: nowIso,
    };

    // ¿Vino al menos un campo editorial? Entonces marcamos y escribimos borrador.
    const hayCambiosEditoriales =
      titulo !== undefined ||
      subtitulo !== undefined ||
      contenido !== undefined ||
      imagen_url !== undefined;

    if (hayCambiosEditoriales) {
      updateData.tiene_borrador = true;
      updateData.borrador_actualizado_en = nowIso;
      updateData.borrador_actualizado_por = ctx.authId;
      if (titulo !== undefined) updateData.titulo_borrador = titulo;
      if (subtitulo !== undefined) updateData.subtitulo_borrador = subtitulo;
      if (contenido !== undefined) updateData.contenido_borrador = contenido;
      if (imagen_url !== undefined) updateData.imagen_url_borrador = imagen_url;
    }

    // activo y orden: aplicación inmediata, no pasan por draft
    let afectaPublico = false;
    if (orden !== undefined) {
      updateData.orden = orden;
      afectaPublico = true;
    }
    if (activo !== undefined) {
      updateData.activo = activo;
      afectaPublico = true;
    }

    // Si afecta al publicado, también marcamos quién lo hizo (trigger 030).
    if (afectaPublico) {
      updateData.actualizado_por = ctx.authId;
    }

    const { data, error } = await supabaseAdmin
      .from('landing_contenido')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Solo invalidamos cache si el cambio afectó al sitio público.
    if (afectaPublico) {
      revalidateTag(LANDING_CACHE_TAG, 'max');
    }

    return NextResponse.json({ seccion: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
