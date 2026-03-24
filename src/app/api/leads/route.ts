import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST — público: crear lead
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nombre, empresa, email, telefono, mensaje, fuente } = body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
      return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        nombre: nombre.trim(),
        empresa: empresa?.trim() || null,
        email: email?.trim() || null,
        telefono: telefono?.trim() || null,
        mensaje: mensaje?.trim() || null,
        fuente: fuente || 'landing',
        estado: 'nuevo',
        whatsapp_enviado: true,
      })
      .select()
      .single();

    if (error) throw error;

    // Obtener config WhatsApp
    const { data: config } = await supabaseAdmin
      .from('landing_contenido')
      .select('contenido')
      .eq('id', 'config_whatsapp')
      .single();

    const whatsapp = config?.contenido || {};
    const numero = (whatsapp.numero as string) || '';
    const msgDefault = (whatsapp.mensaje_default as string) || '';

    let whatsappUrl = '';
    if (numero) {
      const cleanNum = numero.replace(/\D/g, '');
      const textoMsg = mensaje?.trim()
        ? `Hola, soy ${nombre}${empresa ? ` de ${empresa}` : ''}. ${mensaje}`
        : `${msgDefault} Soy ${nombre}${empresa ? ` de ${empresa}` : ''}.`;
      whatsappUrl = `https://wa.me/${cleanNum}?text=${encodeURIComponent(textoMsg)}`;
    }

    return NextResponse.json({ lead: data, whatsapp_url: whatsappUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear lead';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — admin: listar leads
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('auth_id', user.id)
      .single();

    if (perfil?.rol !== 'super_admin' && perfil?.rol !== 'direccion') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const estado = searchParams.get('estado');
    const fuente = searchParams.get('fuente');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (estado && estado !== 'todos') query = query.eq('estado', estado);
    if (fuente && fuente !== 'todos') query = query.eq('fuente', fuente);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ leads: data, total: count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar leads';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT — admin: actualizar estado de lead
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('auth_id', user.id)
      .single();

    if (perfil?.rol !== 'super_admin' && perfil?.rol !== 'direccion') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { id, estado, notas } = body;

    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (estado !== undefined) updateData.estado = estado;
    if (notas !== undefined) updateData.notas = notas;

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ lead: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar lead';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
