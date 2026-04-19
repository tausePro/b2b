import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { obtenerContextoCms } from '@/lib/landing/authCms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface VersionCms {
  id: number;
  seccion_id: string;
  titulo: string | null;
  subtitulo: string | null;
  contenido: Record<string, unknown> | null;
  imagen_url: string | null;
  orden: number | null;
  activo: boolean | null;
  creado_en: string;
  creado_por: string | null;
  nota: string | null;
}

interface VersionConUsuario extends VersionCms {
  creador?: { nombre: string | null; email: string | null } | null;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * GET /api/landing/contenido/[id]/versiones
 * Lista las versiones (snapshots) de una sección del CMS ordenadas por fecha desc.
 * Query params:
 *   - limit: 1..50 (default 20)
 *   - offset: >=0 (default 0)
 */
export async function GET(
  request: NextRequest,
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

    const url = request.nextUrl;
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const parsedOffset = Number.parseInt(url.searchParams.get('offset') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    const { data, error, count } = await supabaseAdmin
      .from('landing_contenido_versiones')
      .select('*', { count: 'exact' })
      .eq('seccion_id', id)
      .order('creado_en', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const versiones = (data ?? []) as VersionCms[];

    // Enriquecer con nombre/email del creador (join manual vía auth_id).
    const authIds = Array.from(
      new Set(versiones.map((v) => v.creado_por).filter((x): x is string => typeof x === 'string'))
    );

    const creadoresMap = new Map<string, { nombre: string | null; email: string | null }>();
    if (authIds.length > 0) {
      const { data: usuarios } = await supabaseAdmin
        .from('usuarios')
        .select('auth_id, nombre, email')
        .in('auth_id', authIds);

      for (const u of (usuarios ?? []) as Array<{ auth_id: string; nombre: string | null; email: string | null }>) {
        creadoresMap.set(u.auth_id, { nombre: u.nombre, email: u.email });
      }
    }

    const versionesEnriquecidas: VersionConUsuario[] = versiones.map((v) => ({
      ...v,
      creador: v.creado_por ? creadoresMap.get(v.creado_por) ?? null : null,
    }));

    return NextResponse.json({
      versiones: versionesEnriquecidas,
      total: count ?? versionesEnriquecidas.length,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar versiones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
