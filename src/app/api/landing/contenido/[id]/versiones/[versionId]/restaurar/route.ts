import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { LANDING_CACHE_TAG } from '@/lib/landing/getContenido';
import { obtenerContextoCms } from '@/lib/landing/authCms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VersionRow {
  id: number;
  seccion_id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown> | null;
  imagen_url: string | null;
  orden: number | null;
  activo: boolean | null;
}

/**
 * POST /api/landing/contenido/[id]/versiones/[versionId]/restaurar
 * Restaura una versión previa como contenido actual de la sección.
 * El UPDATE dispara el trigger que crea un nuevo snapshot del estado anterior,
 * por lo que la restauración también queda en el historial.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const ctx = await obtenerContextoCms();
    if (!ctx) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id, versionId } = await context.params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID de sección requerido' }, { status: 400 });
    }

    const versionIdNum = Number.parseInt(versionId, 10);
    if (!Number.isFinite(versionIdNum) || versionIdNum <= 0) {
      return NextResponse.json({ error: 'ID de versión inválido' }, { status: 400 });
    }

    // 1. Buscar la versión y verificar que pertenezca a la sección
    const { data: versionData, error: errVersion } = await supabaseAdmin
      .from('landing_contenido_versiones')
      .select('id, seccion_id, titulo, subtitulo, contenido, imagen_url, orden, activo')
      .eq('id', versionIdNum)
      .single<VersionRow>();

    if (errVersion || !versionData) {
      return NextResponse.json({ error: 'Versión no encontrada' }, { status: 404 });
    }

    if (versionData.seccion_id !== id) {
      return NextResponse.json(
        { error: 'La versión no corresponde a esta sección' },
        { status: 400 }
      );
    }

    // 2. Aplicar como estado actual (el trigger snapshotea el estado previo)
    const { data: seccion, error: errUpdate } = await supabaseAdmin
      .from('landing_contenido')
      .update({
        titulo: versionData.titulo,
        subtitulo: versionData.subtitulo,
        contenido: versionData.contenido,
        imagen_url: versionData.imagen_url,
        orden: versionData.orden,
        activo: versionData.activo,
        actualizado_por: ctx.authId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (errUpdate) throw errUpdate;

    // 3. Invalidar cache del landing
    revalidateTag(LANDING_CACHE_TAG, 'max');

    return NextResponse.json({ seccion, restaurada_desde: versionIdNum });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al restaurar versión';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
