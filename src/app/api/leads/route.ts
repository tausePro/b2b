import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Campos de atribución aceptados por el POST. Todos opcionales;
// provienen de la cookie `lead_attr` escrita por
// `captureLeadAttributionFromUrl()` cuando el visitante llega con
// gclid/utm_* en la URL. Se sanitizan antes de persistir.
const ATTRIBUTION_KEYS = [
  'gclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
  'landing_url',
] as const;
const MAX_ATTR_LEN = 500;

function sanitizeAttributionString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_ATTR_LEN);
}

function sanitizeClickAt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // Evitamos aceptar timestamps futuros (más de 5 minutos por encima
  // del reloj del servidor) para protegernos de cookies manipuladas.
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) return null;
  return parsed.toISOString();
}

// POST — público: crear lead
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nombre, empresa, email, telefono, mensaje, fuente } = body;
    // numero_whatsapp_override permite redirigir la conversacion a un
    // numero distinto al global (ej: WhatsApp de la comercial especifica
    // cuando el lead viene de una tarjeta del equipo). Se sanitiza a
    // solo digitos; si queda vacio, se ignora.
    const overrideRaw =
      typeof body.numero_whatsapp_override === 'string'
        ? body.numero_whatsapp_override
        : '';
    const numeroOverride = overrideRaw.replace(/\D/g, '');

    if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
      return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
    }

    // Extrae y sanitiza la atribución desde el payload (cookie lead_attr
    // reenviada por el cliente). Cualquier valor vacío o mal formado se
    // convierte en null para no poluir la tabla.
    const attribution: Record<string, string | null> = {};
    const attrSource =
      body.attribution && typeof body.attribution === 'object'
        ? (body.attribution as Record<string, unknown>)
        : {};
    for (const key of ATTRIBUTION_KEYS) {
      attribution[key] = sanitizeAttributionString(attrSource[key]);
    }
    const clickAt = sanitizeClickAt(attrSource.click_at);

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
        ...attribution,
        click_at: clickAt,
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
    const numeroGlobal = (whatsapp.numero as string) || '';
    const msgDefault = (whatsapp.mensaje_default as string) || '';

    // Prioridad: numeroOverride > numero global configurado en config_whatsapp.
    // Si ambos estan vacios no se arma wa.me y el front simplemente cierra
    // el modal tras guardar el lead (queda registrado igualmente en BD).
    const numeroFinal = numeroOverride || numeroGlobal.replace(/\D/g, '');

    let whatsappUrl = '';
    if (numeroFinal) {
      const textoMsg = mensaje?.trim()
        ? `Hola, soy ${nombre}${empresa ? ` de ${empresa}` : ''}. ${mensaje}`
        : `${msgDefault} Soy ${nombre}${empresa ? ` de ${empresa}` : ''}.`;
      whatsappUrl = `https://wa.me/${numeroFinal}?text=${encodeURIComponent(textoMsg)}`;
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

    if (perfil?.rol !== 'super_admin' && perfil?.rol !== 'direccion' && perfil?.rol !== 'editor_contenido') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const estado = searchParams.get('estado');
    const fuente = searchParams.get('fuente');
    // fuente_prefix: filtra por prefijo (ej: 'producto_' matchea
    // producto_12, producto_34_cta, etc.). Util para agrupar fuentes
    // dinamicas en el dashboard sin tener un listado exhaustivo.
    const fuentePrefix = searchParams.get('fuente_prefix');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (estado && estado !== 'todos') query = query.eq('estado', estado);
    if (fuente && fuente !== 'todos') {
      query = query.eq('fuente', fuente);
    } else if (fuentePrefix) {
      // Escapamos wildcards del usuario (%, _) antes de hacer LIKE para
      // evitar que un prefix 'foo_' matchee demasiado ancho (siempre lo
      // haria porque _ en LIKE es comodin de un char). Uso like() directo
      // con anchura fija y acepto ese comportamiento porque los prefijos
      // del admin son controlados por nosotros.
      query = query.like('fuente', `${fuentePrefix}%`);
    }

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

    if (perfil?.rol !== 'super_admin' && perfil?.rol !== 'direccion' && perfil?.rol !== 'editor_contenido') {
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

// DELETE — admin: eliminar lead. Hard-delete restringido a super_admin
// y direccion. Caso de uso principal: limpiar leads de prueba creados
// durante QA del sitio. Si en el futuro queremos papelera con opcion
// de restaurar, migrar a soft-delete via columna `deleted_at`.
//
// Acepta un solo id (`?id=<uuid>`) o multiples via body JSON
// (`{ ids: [uuid, uuid] }`) para habilitar borrado masivo.
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const { data: perfil } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('auth_id', user.id)
      .single();

    // Intencionalmente mas restrictivo que PUT: solo roles administrativos
    // altos pueden eliminar. 'editor_contenido' puede gestionar leads
    // pero no borrarlos.
    if (perfil?.rol !== 'super_admin' && perfil?.rol !== 'direccion') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const ids: string[] = [];

    const idFromQuery = request.nextUrl.searchParams.get('id');
    if (idFromQuery) ids.push(idFromQuery);

    // Parsear body solo si vino con contenido (DELETE suele no tenerlo).
    try {
      const raw = await request.text();
      if (raw) {
        const body = JSON.parse(raw) as { ids?: unknown };
        if (Array.isArray(body.ids)) {
          for (const id of body.ids) {
            if (typeof id === 'string' && id.length > 0) ids.push(id);
          }
        }
      }
    } catch {
      // Body no-JSON: lo ignoramos, usamos solo ?id=.
    }

    // Deduplicar y validar formato UUID basico (prevenir injection en el
    // query aunque supabase-js ya parametriza).
    const uuidRegex = /^[0-9a-fA-F-]{36}$/;
    const idsValidos = Array.from(new Set(ids)).filter((id) => uuidRegex.test(id));

    if (idsValidos.length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos un ID valido' }, { status: 400 });
    }

    const { error, count } = await supabaseAdmin
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', idsValidos);

    if (error) throw error;

    return NextResponse.json({ eliminados: count ?? 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al eliminar lead';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
