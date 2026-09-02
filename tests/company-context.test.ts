import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActiveCompanyStorageKey,
  getCartStorageKey,
  getDefaultSiteId,
  normalizeCompanyMemberships,
  selectActiveCompany,
  validateOrderCompanyContext,
} from '../src/lib/auth/companyContext';

const memberships = normalizeCompanyMemberships([
  {
    id: 'membership-primary',
    empresa_id: 'company-primary',
    empresa_nombre: 'Empresa principal',
    rol: 'comprador',
    activo: true,
    es_principal: true,
    usa_sedes: true,
    requiere_aprobacion: true,
    sede_ids: ['site-a', 'site-b'],
    sedes: [
      { id: 'site-a', nombre: 'Sede A', ciudad: 'Bogotá', es_predeterminada: false },
      { id: 'site-b', nombre: 'Sede B', ciudad: 'Medellín', es_predeterminada: true },
    ],
  },
  {
    id: 'membership-secondary',
    empresa_id: 'company-secondary',
    empresa_nombre: 'Empresa secundaria',
    rol: 'aprobador',
    activo: true,
    es_principal: false,
    usa_sedes: true,
    requiere_aprobacion: true,
    sede_ids: ['site-c'],
    sedes: [{ id: 'site-c', nombre: 'Sede C', ciudad: null, es_predeterminada: false }],
  },
  {
    id: 'membership-inactive',
    empresa_id: 'company-inactive',
    empresa_nombre: 'Empresa inactiva',
    rol: 'comprador',
    activo: false,
  },
], {
  userId: 'user-1',
  empresaId: 'company-primary',
  sedeId: 'site-a',
  role: 'comprador',
});

test('normaliza solo membresías activas con roles cliente válidos', () => {
  assert.equal(memberships.length, 2);
  assert.deepEqual(memberships.map((item) => item.empresa_id), ['company-primary', 'company-secondary']);
  assert.equal(memberships[0].rol, 'comprador');
  assert.equal(memberships[1].rol, 'aprobador');
});

test('respeta la empresa preferida y conserva la principal como fallback', () => {
  assert.equal(selectActiveCompany(memberships, 'company-secondary', 'company-primary')?.empresa_id, 'company-secondary');
  assert.equal(selectActiveCompany(memberships, 'company-unknown', 'company-primary')?.empresa_id, 'company-primary');
});

test('resuelve sede predeterminada y sede única', () => {
  assert.equal(getDefaultSiteId(memberships[0]), 'site-b');
  assert.equal(getDefaultSiteId(memberships[1]), 'site-c');
});

test('aísla empresa activa y carrito por usuario y empresa', () => {
  assert.equal(getActiveCompanyStorageKey('user-1'), 'b2b_active_company_user-1');
  assert.notEqual(
    getCartStorageKey('user-1', 'company-primary'),
    getCartStorageKey('user-1', 'company-secondary'),
  );
  assert.equal(getCartStorageKey('user-1', null), null);
});

test('solo permite crear pedidos con rol comprador y sede autorizada', () => {
  const buyerAccess = { companyId: 'company-primary', role: 'comprador' as const, siteIds: ['site-a', 'site-b'] };
  assert.equal(validateOrderCompanyContext(buyerAccess, {
    companyId: 'company-primary',
    siteId: 'site-a',
    usesSites: true,
  }), null);
  assert.equal(validateOrderCompanyContext(buyerAccess, {
    companyId: 'company-primary',
    siteId: null,
    usesSites: true,
  }), 'SITE_REQUIRED');
  assert.equal(validateOrderCompanyContext(buyerAccess, {
    companyId: 'company-primary',
    siteId: 'site-unauthorized',
    usesSites: true,
  }), 'SITE_FORBIDDEN');
  assert.equal(validateOrderCompanyContext({ ...buyerAccess, role: 'aprobador' }, {
    companyId: 'company-primary',
    siteId: 'site-a',
    usesSites: true,
  }), 'ROLE_FORBIDDEN');
  assert.equal(validateOrderCompanyContext(buyerAccess, {
    companyId: 'company-secondary',
    siteId: 'site-a',
    usesSites: true,
  }), 'COMPANY_FORBIDDEN');
});

test('mantiene compatibilidad con el perfil legado de una sola empresa', () => {
  const legacy = normalizeCompanyMemberships(undefined, {
    userId: 'legacy-user',
    empresaId: 'legacy-company',
    sedeId: 'legacy-site',
    role: 'comprador',
  });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].empresa_id, 'legacy-company');
  assert.equal(legacy[0].rol, 'comprador');
  assert.deepEqual(legacy[0].sede_ids, ['legacy-site']);
});
