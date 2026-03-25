import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

export type ApiActorRole = UserRole | 'editor_contenido';

type ActorProfileRow = {
  id: string;
  rol: ApiActorRole | null;
  activo: boolean | null;
  empresa_id: string | null;
};

type NumericValueRow = Record<string, unknown>;

export type AuthorizedApiContext = {
  admin: ReturnType<typeof getSupabaseAdmin>;
  actor: {
    authUserId: string;
    empresa_id: string | null;
    id: string;
    rol: ApiActorRole;
  };
};

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function addPositiveNumber(target: Set<number>, value: unknown) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    target.add(parsed);
  }
}

export async function authorizeApiRoles(
  allowedRoles: readonly ApiActorRole[]
): Promise<AuthorizedApiContext | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        error: 'UNAUTHORIZED',
        details: authError?.message ?? null,
      },
      { status: 401 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('usuarios')
    .select('id, rol, activo, empresa_id')
    .eq('auth_id', user.id)
    .maybeSingle();

  const actorProfile = (data ?? null) as ActorProfileRow | null;

  if (
    error ||
    !actorProfile ||
    !actorProfile.activo ||
    !actorProfile.rol ||
    !allowedRoles.includes(actorProfile.rol)
  ) {
    return NextResponse.json(
      {
        error: 'FORBIDDEN',
        details: error?.message ?? null,
      },
      { status: 403 }
    );
  }

  return {
    admin,
    actor: {
      authUserId: user.id,
      empresa_id: actorProfile.empresa_id,
      id: actorProfile.id,
      rol: actorProfile.rol,
    },
  };
}

export async function getAccessibleEmpresaIds(
  context: AuthorizedApiContext
): Promise<string[]> {
  if (context.actor.rol === 'super_admin' || context.actor.rol === 'direccion') {
    const { data, error } = await context.admin.from('empresas').select('id');
    if (error || !data) {
      return [];
    }

    return Array.from(new Set(data.map((item) => String(item.id))));
  }

  if (context.actor.rol === 'asesor') {
    const { data, error } = await context.admin
      .from('asesor_empresas')
      .select('empresa_id')
      .eq('usuario_id', context.actor.id)
      .eq('activo', true);

    if (error || !data) {
      return [];
    }

    return Array.from(new Set(data.map((item) => String(item.empresa_id))));
  }

  return context.actor.empresa_id ? [context.actor.empresa_id] : [];
}

export async function getAccessibleOdooPartnerIds(
  context: AuthorizedApiContext
): Promise<Set<number>> {
  const empresaIds = await getAccessibleEmpresaIds(context);
  const partnerIds = new Set<number>();

  if (empresaIds.length === 0) {
    return partnerIds;
  }

  const { data: empresasData, error: empresasError } = await context.admin
    .from('empresas')
    .select('odoo_partner_id')
    .in('id', empresaIds);

  if (!empresasError && Array.isArray(empresasData)) {
    empresasData.forEach((item) => {
      addPositiveNumber(partnerIds, (item as NumericValueRow).odoo_partner_id);
    });
  }

  const { data: configData, error: configError } = await context.admin
    .from('empresa_configs')
    .select('empresa_id, odoo_partner_id')
    .in('empresa_id', empresaIds);

  if (!configError && Array.isArray(configData)) {
    configData.forEach((item) => {
      addPositiveNumber(partnerIds, (item as NumericValueRow).odoo_partner_id);
    });
  }

  return partnerIds;
}
