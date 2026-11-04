import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { VIEW_AS_COOKIE } from '@/lib/auth/viewAs';
import { clearViewAsCookies, createResponseSupabaseClient, openViewAs } from '@/lib/auth/viewAs.server';

export const dynamic = 'force-dynamic';

async function exitViewAs(request: NextRequest, asRedirect: boolean) {
  const marker = openViewAs(request.cookies.get(VIEW_AS_COOKIE)?.value);
  const expired = request.nextUrl.searchParams.get('motivo') === 'expirado';
  const carrier = NextResponse.next();
  const client = createResponseSupabaseClient(request, carrier);
  await client.auth.signOut({ scope: 'local' });
  let restored = false;
  if (marker) {
    const { error } = await client.auth.refreshSession({ refresh_token: marker.adminRefreshToken });
    restored = !error;
    const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from('ver_como_auditoria').update({ finalizado_at: new Date().toISOString(), motivo_fin: expired ? 'expirado' : 'salida' })
      .eq('id', marker.auditId).is('finalizado_at', null);
  }
  const destination = restored ? `/admin/ver-como${expired ? '?expirado=1' : ''}` : '/login';
  const response = asRedirect
    ? NextResponse.redirect(new URL(destination, request.url))
    : NextResponse.json({ ok: true, restored, redirect: destination }, { headers: { 'Cache-Control': 'private, no-store' } });
  for (const cookie of carrier.cookies.getAll()) response.cookies.set(cookie);
  clearViewAsCookies(response);
  return response;
}

export async function POST(request: NextRequest) {
  return exitViewAs(request, false);
}

export async function GET(request: NextRequest) {
  return exitViewAs(request, true);
}
