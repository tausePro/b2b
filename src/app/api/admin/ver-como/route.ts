import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VIEW_AS_COOKIE, VIEW_AS_MAX_MS } from '@/lib/auth/viewAs';
import { createResponseSupabaseClient, setViewAsCookies } from '@/lib/auth/viewAs.server';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: HEADERS });
}

function getSupabaseAdmin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'UNAUTHORIZED' }, 401) };
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('usuarios').select('id, rol, activo').eq('auth_id', user.id).maybeSingle();
  if (!data?.activo || data.rol !== 'super_admin') return { error: json({ error: 'FORBIDDEN' }, 403) };
  return { supabase, admin, actor: data as { id: string; rol: string; activo: boolean } };
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;
  const search = (request.nextUrl.searchParams.get('buscar') ?? '').replace(/[,()*%\\"]/g, ' ').trim().slice(0, 80);
  let query = auth.admin.from('usuarios').select('id, nombre, apellido, email, rol, empresa:empresas(nombre)')
    .eq('activo', true).not('auth_id', 'is', null).neq('rol', 'super_admin').order('nombre').limit(50);
  if (search) query = query.or(`nombre.ilike.%${search}%,apellido.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return json({ error: 'No se pudieron consultar los usuarios.' }, 500);
  return json({
    usuarios: (data ?? []).map(row => {
      const empresa = Array.isArray(row.empresa) ? row.empresa[0] : row.empresa;
      return { id: row.id, nombre: `${row.nombre} ${row.apellido ?? ''}`.trim(), email: row.email, rol: row.rol, empresa: (empresa as { nombre?: string } | null)?.nombre ?? null };
    }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;
  if (request.cookies.get(VIEW_AS_COOKIE)) return json({ error: 'Ya estás en modo ver como. Sal antes de elegir otro usuario.' }, 409);
  const body = await request.json().catch(() => null) as { usuario_id?: unknown } | null;
  const targetId = typeof body?.usuario_id === 'string' ? body.usuario_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === auth.actor.id) return json({ error: 'Selecciona un usuario válido.' }, 400);
  const { data: target } = await auth.admin.from('usuarios').select('id, nombre, apellido, email, rol, activo, auth_id').eq('id', targetId).maybeSingle();
  if (!target?.activo || !target.auth_id || !target.email || target.rol === 'super_admin') return json({ error: 'Ese usuario no está disponible para ver como.' }, 400);
  const { data: { session } } = await auth.supabase.auth.getSession();
  if (!session?.refresh_token) return json({ error: 'Tu sesión no permite volver a Super Admin. Inicia sesión de nuevo.' }, 401);
  const { data: audit, error: auditError } = await auth.admin.from('ver_como_auditoria').insert({
    actor_id: auth.actor.id, objetivo_id: target.id,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    user_agent: request.headers.get('user-agent')?.slice(0, 300) || null,
  }).select('id').single();
  if (auditError || !audit) return json({ error: 'No se pudo registrar la auditoría (¿falta la migración 053?). No se inicia el modo ver como sin registro.' }, 503);
  const fail = async (message: string) => {
    await auth.admin.from('ver_como_auditoria').update({ finalizado_at: new Date().toISOString(), motivo_fin: 'error' }).eq('id', audit.id);
    return json({ error: message }, 502);
  };
  const { data: link, error: linkError } = await auth.admin.auth.admin.generateLink({ type: 'magiclink', email: target.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return fail('No se pudo preparar la vista del usuario.');
  const response = json({ ok: true, redirect: '/dashboard' });
  const { error: verifyError } = await createResponseSupabaseClient(request, response).auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (verifyError) return fail('No se pudo abrir la vista del usuario.');
  const startedAt = Date.now();
  setViewAsCookies(response, {
    actorId: auth.actor.id, targetId: target.id, targetName: `${target.nombre} ${target.apellido ?? ''}`.trim(),
    auditId: audit.id, startedAt, adminRefreshToken: session.refresh_token,
  }, startedAt + VIEW_AS_MAX_MS);
  return response;
}
