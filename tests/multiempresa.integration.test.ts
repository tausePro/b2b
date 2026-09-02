import assert from 'node:assert/strict';
import test from 'node:test';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local', quiet: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdmin() {
  assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL es requerida');
  assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY es requerida');
  return createClient(supabaseUrl, serviceRoleKey);
}

test('los correos de usuario siguen siendo únicos sin distinguir mayúsculas', async () => {
  const admin = getAdmin();
  const { data, error } = await admin.from('usuarios').select('id, email');
  assert.ifError(error);
  const seen = new Set<string>();
  for (const user of data ?? []) {
    const normalized = String(user.email).trim().toLowerCase();
    assert.ok(!seen.has(normalized), `El correo ${normalized} está duplicado`);
    seen.add(normalized);
  }
});

test('cada usuario cliente actual conserva su empresa y rol principal', async () => {
  const admin = getAdmin();
  const [{ data: users, error: usersError }, { data: memberships, error: membershipsError }] = await Promise.all([
    admin
      .from('usuarios')
      .select('id, empresa_id, sede_id, rol, activo')
      .in('rol', ['comprador', 'aprobador'])
      .eq('activo', true),
    admin
      .from('usuario_empresas')
      .select('id, usuario_id, empresa_id, rol, activo, es_principal'),
  ]);
  assert.ifError(usersError);
  assert.ifError(membershipsError);

  const activeMemberships = (memberships ?? []).filter((membership) => membership.activo);
  for (const user of users ?? []) {
    const principal = activeMemberships.find((membership) =>
      membership.usuario_id === user.id
      && membership.empresa_id === user.empresa_id
      && membership.es_principal,
    );
    assert.ok(principal, `El usuario ${user.id} debe conservar una membresía principal`);
    assert.equal(principal.rol, user.rol, `El rol principal del usuario ${user.id} debe conservarse`);
  }
});

test('los helpers de membresía y rol reconocen los accesos reales', async () => {
  const admin = getAdmin();
  const { data: memberships, error } = await admin
    .from('usuario_empresas')
    .select('usuario_id, empresa_id, rol')
    .eq('activo', true);
  assert.ifError(error);

  for (const membership of memberships ?? []) {
    const [{ data: belongs, error: belongsError }, { data: hasRole, error: roleError }] = await Promise.all([
      admin.rpc('usuario_pertenece_a_empresa', {
        p_usuario_id: membership.usuario_id,
        p_empresa_id: membership.empresa_id,
      }),
      admin.rpc('usuario_tiene_rol_en_empresa', {
        p_usuario_id: membership.usuario_id,
        p_empresa_id: membership.empresa_id,
        p_rol: membership.rol,
      }),
    ]);
    assert.ifError(belongsError);
    assert.ifError(roleError);
    assert.equal(belongs, true, `La membresía ${membership.usuario_id}/${membership.empresa_id} no fue reconocida`);
    assert.equal(hasRole, true, `El rol ${membership.rol} no fue reconocido`);
  }
});

test('los helpers de sede reconocen únicamente asignaciones válidas', async () => {
  const admin = getAdmin();
  const { data: mappings, error } = await admin
    .from('usuario_empresa_sedes')
    .select('sede_id, usuario_empresa:usuario_empresas!usuario_empresa_sedes_usuario_empresa_id_fkey(usuario_id, empresa_id)')
    .eq('activa', true);
  assert.ifError(error);

  for (const mapping of mappings ?? []) {
    const relation = Array.isArray(mapping.usuario_empresa) ? mapping.usuario_empresa[0] : mapping.usuario_empresa;
    assert.ok(relation, `La sede ${mapping.sede_id} no tiene membresía`);
    const { data: hasSite, error: siteError } = await admin.rpc('usuario_tiene_acceso_sede', {
      p_usuario_id: relation.usuario_id,
      p_empresa_id: relation.empresa_id,
      p_sede_id: mapping.sede_id,
    });
    assert.ifError(siteError);
    assert.equal(hasSite, true, `La sede ${mapping.sede_id} no fue reconocida`);
  }
});

test('ningún usuario tiene más de una empresa principal activa', async () => {
  const admin = getAdmin();
  const { data, error } = await admin
    .from('usuario_empresas')
    .select('usuario_id')
    .eq('activo', true)
    .eq('es_principal', true);
  assert.ifError(error);

  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.usuario_id, (counts.get(row.usuario_id) ?? 0) + 1);
  for (const [userId, count] of counts) {
    assert.equal(count, 1, `El usuario ${userId} tiene ${count} empresas principales`);
  }
});

test('todas las sedes asignadas pertenecen a la empresa de la membresía', async () => {
  const admin = getAdmin();
  const [membershipsResult, mappingsResult, sitesResult] = await Promise.all([
    admin.from('usuario_empresas').select('id, empresa_id, rol, activo'),
    admin.from('usuario_empresa_sedes').select('usuario_empresa_id, sede_id, activa'),
    admin.from('sedes').select('id, empresa_id, activa'),
  ]);
  assert.ifError(membershipsResult.error);
  assert.ifError(mappingsResult.error);
  assert.ifError(sitesResult.error);

  const memberships = new Map((membershipsResult.data ?? []).map((row) => [row.id, row]));
  const sites = new Map((sitesResult.data ?? []).map((row) => [row.id, row]));
  for (const mapping of (mappingsResult.data ?? []).filter((row) => row.activa)) {
    const membership = memberships.get(mapping.usuario_empresa_id);
    const site = sites.get(mapping.sede_id);
    assert.ok(membership, `No existe la membresía ${mapping.usuario_empresa_id}`);
    assert.ok(site, `No existe la sede ${mapping.sede_id}`);
    assert.equal(site.empresa_id, membership.empresa_id, `La sede ${site.id} cruza empresas`);
  }
});

test('las membresías activas en empresas con sedes conservan al menos una sede permitida', async () => {
  const admin = getAdmin();
  const [membershipsResult, companiesResult, mappingsResult] = await Promise.all([
    admin.from('usuario_empresas').select('id, empresa_id, rol, activo').eq('activo', true),
    admin.from('empresas').select('id, usa_sedes'),
    admin.from('usuario_empresa_sedes').select('usuario_empresa_id, activa').eq('activa', true),
  ]);
  assert.ifError(membershipsResult.error);
  assert.ifError(companiesResult.error);
  assert.ifError(mappingsResult.error);

  const companies = new Map((companiesResult.data ?? []).map((row) => [row.id, row]));
  const mappedMembershipIds = new Set((mappingsResult.data ?? []).map((row) => row.usuario_empresa_id));
  for (const membership of membershipsResult.data ?? []) {
    if (companies.get(membership.empresa_id)?.usa_sedes) {
      assert.ok(mappedMembershipIds.has(membership.id), `La membresía ${membership.id} no tiene sedes autorizadas`);
    }
  }
});
