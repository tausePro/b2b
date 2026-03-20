import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('landing_contenido')
      .select('*')
      .eq('activo', true)
      .order('orden');

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
