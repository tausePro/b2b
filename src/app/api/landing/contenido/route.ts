import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { LANDING_CACHE_TAG } from '@/lib/landing/getContenido';

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

async function verificarAdmin(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('auth_id', user.id)
      .single();

    return perfil?.rol === 'super_admin' || perfil?.rol === 'direccion' || perfil?.rol === 'editor_contenido';
  } catch {
    return false;
  }
}

export async function PUT(request: NextRequest) {
  try {
    const isAdmin = await verificarAdmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { id, titulo, subtitulo, contenido, imagen_url, orden, activo } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID de sección requerido' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (titulo !== undefined) updateData.titulo = titulo;
    if (subtitulo !== undefined) updateData.subtitulo = subtitulo;
    if (contenido !== undefined) updateData.contenido = contenido;
    if (imagen_url !== undefined) updateData.imagen_url = imagen_url;
    if (orden !== undefined) updateData.orden = orden;
    if (activo !== undefined) updateData.activo = activo;

    const { data, error } = await supabaseAdmin
      .from('landing_contenido')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Invalidar cache de landing para reflejar cambios en el sitio público de inmediato
    revalidateTag(LANDING_CACHE_TAG, 'max');

    return NextResponse.json({ seccion: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
