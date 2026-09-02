import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientCompanyRole } from '@/lib/auth/companyContext';

export interface ClientCompanyAccess {
  membershipId: string;
  companyId: string;
  role: ClientCompanyRole;
  siteIds: string[];
  defaultSiteId: string | null;
  isPrimary: boolean;
}

export async function getClientCompanyAccess(
  admin: SupabaseClient,
  userId: string,
  companyId: string
): Promise<ClientCompanyAccess | null> {
  const { data: membership, error: membershipError } = await admin
    .from('usuario_empresas')
    .select('id, empresa_id, rol, activo, es_principal')
    .eq('usuario_id', userId)
    .eq('empresa_id', companyId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    const { count, error: countError } = await admin
      .from('usuario_empresas')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', userId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) return null;

    const { data: legacyUser, error: legacyError } = await admin
      .from('usuarios')
      .select('id, empresa_id, sede_id, rol, activo')
      .eq('id', userId)
      .eq('empresa_id', companyId)
      .maybeSingle();
    if (legacyError) throw legacyError;
    if (!legacyUser?.activo || !['comprador', 'aprobador'].includes(String(legacyUser.rol))) return null;
    const legacySiteId = legacyUser.sede_id ? String(legacyUser.sede_id) : null;
    return {
      membershipId: `legacy:${userId}:${companyId}`,
      companyId,
      role: legacyUser.rol as ClientCompanyRole,
      siteIds: legacySiteId ? [legacySiteId] : [],
      defaultSiteId: legacySiteId,
      isPrimary: true,
    };
  }
  if (!membership.activo || !membership.id || !['comprador', 'aprobador'].includes(String(membership.rol))) return null;

  const { data: siteRows, error: siteError } = await admin
    .from('usuario_empresa_sedes')
    .select('sede_id, es_predeterminada')
    .eq('usuario_empresa_id', membership.id)
    .eq('activa', true);
  if (siteError) throw siteError;

  const sites = (siteRows ?? []).map((row) => ({
    id: String(row.sede_id),
    isDefault: row.es_predeterminada === true,
  }));

  return {
    membershipId: String(membership.id),
    companyId: String(membership.empresa_id),
    role: membership.rol as ClientCompanyRole,
    siteIds: sites.map((site) => site.id),
    defaultSiteId: sites.find((site) => site.isDefault)?.id ?? (sites.length === 1 ? sites[0].id : null),
    isPrimary: membership.es_principal === true,
  };
}

export async function getClientCompanyRole(
  admin: SupabaseClient,
  userId: string,
  companyId: string
): Promise<ClientCompanyRole | null> {
  const access = await getClientCompanyAccess(admin, userId, companyId);
  return access?.role ?? null;
}
