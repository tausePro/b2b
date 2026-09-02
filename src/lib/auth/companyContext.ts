export type ClientCompanyRole = 'comprador' | 'aprobador';

export interface UserCompanySite {
  id: string;
  nombre: string;
  ciudad: string | null;
  es_predeterminada: boolean;
}

export interface UserCompanyMembership {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  rol: ClientCompanyRole;
  activo: boolean;
  es_principal: boolean;
  odoo_partner_id: number | null;
  requiere_aprobacion: boolean;
  usa_sedes: boolean;
  logo_url: string | null;
  color_primario: string | null;
  slug: string | null;
  configuracion_extra: Record<string, unknown>;
  sede_ids: string[];
  sedes: UserCompanySite[];
}

const CLIENT_COMPANY_ROLES = new Set<ClientCompanyRole>(['comprador', 'aprobador']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeCompanyMemberships(
  raw: unknown,
  legacy: { userId: string; empresaId: string | null; sedeId: string | null; role: string }
): UserCompanyMembership[] {
  const rows = Array.isArray(raw) ? raw : [];
  const memberships = rows.flatMap((value): UserCompanyMembership[] => {
    const row = asRecord(value);
    const empresaId = asString(row.empresa_id);
    const role = asString(row.rol) as ClientCompanyRole | null;
    if (!empresaId || !role || !CLIENT_COMPANY_ROLES.has(role) || row.activo === false) return [];

    const sites = (Array.isArray(row.sedes) ? row.sedes : []).flatMap((siteValue): UserCompanySite[] => {
      const site = asRecord(siteValue);
      const id = asString(site.id);
      if (!id) return [];
      return [{
        id,
        nombre: asString(site.nombre) ?? id,
        ciudad: asString(site.ciudad),
        es_predeterminada: site.es_predeterminada === true,
      }];
    });
    const siteIds = Array.from(new Set([
      ...(Array.isArray(row.sede_ids) ? row.sede_ids.map(asString).filter((id): id is string => Boolean(id)) : []),
      ...sites.map((site) => site.id),
    ]));

    return [{
      id: asString(row.id) ?? `${legacy.userId}:${empresaId}`,
      empresa_id: empresaId,
      empresa_nombre: asString(row.empresa_nombre) ?? empresaId,
      rol: role,
      activo: true,
      es_principal: row.es_principal === true,
      odoo_partner_id: typeof row.odoo_partner_id === 'number' ? row.odoo_partner_id : null,
      requiere_aprobacion: row.requiere_aprobacion !== false,
      usa_sedes: row.usa_sedes !== false,
      logo_url: asString(row.logo_url),
      color_primario: asString(row.color_primario),
      slug: asString(row.slug),
      configuracion_extra: asRecord(row.configuracion_extra),
      sede_ids: siteIds,
      sedes: sites,
    }];
  });

  if (memberships.length > 0) return memberships;
  if (!legacy.empresaId || !CLIENT_COMPANY_ROLES.has(legacy.role as ClientCompanyRole)) return [];

  const fallbackSites = legacy.sedeId
    ? [{ id: legacy.sedeId, nombre: legacy.sedeId, ciudad: null, es_predeterminada: true }]
    : [];
  return [{
    id: `${legacy.userId}:${legacy.empresaId}`,
    empresa_id: legacy.empresaId,
    empresa_nombre: legacy.empresaId,
    rol: legacy.role as ClientCompanyRole,
    activo: true,
    es_principal: true,
    odoo_partner_id: null,
    requiere_aprobacion: true,
    usa_sedes: Boolean(legacy.sedeId),
    logo_url: null,
    color_primario: null,
    slug: null,
    configuracion_extra: {},
    sede_ids: legacy.sedeId ? [legacy.sedeId] : [],
    sedes: fallbackSites,
  }];
}

export function selectActiveCompany(
  memberships: UserCompanyMembership[],
  preferredCompanyId?: string | null,
  principalCompanyId?: string | null
): UserCompanyMembership | null {
  if (memberships.length === 0) return null;
  return memberships.find((membership) => membership.empresa_id === preferredCompanyId)
    ?? memberships.find((membership) => membership.es_principal)
    ?? memberships.find((membership) => membership.empresa_id === principalCompanyId)
    ?? memberships[0];
}

export function getDefaultSiteId(membership: UserCompanyMembership | null) {
  if (!membership) return null;
  return membership.sedes.find((site) => site.es_predeterminada)?.id
    ?? (membership.sede_ids.length === 1 ? membership.sede_ids[0] : null);
}

export type OrderCompanyContextError = 'COMPANY_FORBIDDEN' | 'ROLE_FORBIDDEN' | 'SITE_REQUIRED' | 'SITE_FORBIDDEN';

export function validateOrderCompanyContext(
  access: { companyId: string; role: ClientCompanyRole; siteIds: string[] } | null,
  input: { companyId: string; siteId: string | null; usesSites: boolean }
): OrderCompanyContextError | null {
  if (!access || access.companyId !== input.companyId) return 'COMPANY_FORBIDDEN';
  if (access.role !== 'comprador') return 'ROLE_FORBIDDEN';
  if (input.usesSites && !input.siteId) return 'SITE_REQUIRED';
  if (input.siteId && !access.siteIds.includes(input.siteId)) return 'SITE_FORBIDDEN';
  return null;
}

export function getActiveCompanyStorageKey(userId: string) {
  return `b2b_active_company_${userId}`;
}

export function getCartStorageKey(userId: string | null, companyId: string | null) {
  return userId && companyId ? `b2b_cart_${userId}_${companyId}` : null;
}
