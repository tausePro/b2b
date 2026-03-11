import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PROFILE_SELECT = 'id, auth_id, email, nombre, apellido, rol, empresa_id, sede_id, avatar, activo, created_at';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          details: userError?.message ?? null,
        },
        { status: 401 }
      );
    }

    const { data: rpcProfile } = await supabase.rpc('get_mi_perfil');
    if (rpcProfile) {
      return NextResponse.json({ profile: rpcProfile });
    }

    const admin = getSupabaseAdmin();

    const { data: profileByAuthId, error: profileByAuthIdError } = await admin
      .from('usuarios')
      .select(PROFILE_SELECT)
      .eq('auth_id', user.id)
      .maybeSingle();

    if (profileByAuthId) {
      return NextResponse.json({ profile: profileByAuthId });
    }

    if (!user.email) {
      return NextResponse.json(
        {
          error: 'PROFILE_NOT_FOUND',
          auth_id: user.id,
          email: null,
          details: {
            profileByAuthIdError: profileByAuthIdError?.message ?? null,
          },
        },
        { status: 404 }
      );
    }

    const { data: profileByEmail, error: profileByEmailError } = await admin
      .from('usuarios')
      .select(PROFILE_SELECT)
      .ilike('email', user.email)
      .maybeSingle();

    if (!profileByEmail) {
      return NextResponse.json(
        {
          error: 'PROFILE_NOT_FOUND',
          auth_id: user.id,
          email: user.email,
          details: {
            profileByAuthIdError: profileByAuthIdError?.message ?? null,
            profileByEmailError: profileByEmailError?.message ?? null,
          },
        },
        { status: 404 }
      );
    }

    const { data: relinkedProfile, error: relinkError } = await admin
      .from('usuarios')
      .update({
        auth_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileByEmail.id)
      .select(PROFILE_SELECT)
      .maybeSingle();

    if (relinkError || !relinkedProfile) {
      return NextResponse.json(
        {
          error: 'PROFILE_RELINK_FAILED',
          auth_id: user.id,
          email: user.email,
          details: {
            relinkError: relinkError?.message ?? null,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: relinkedProfile, relinked: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
