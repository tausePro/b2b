import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessDashboardPath } from '../src/lib/auth/routeAccess';
import { buildMenuGroups, buildMobileDestinations, isMenuItemActive, MENU_BY_ROLE } from '../src/lib/navigation/menu';
import type { UserRole } from '../src/types';

test('menú agrupado: Dirección ve Gerencia, Comercial, Operación y Sistema como en la propuesta', () => {
  const groups = buildMenuGroups(['direccion']);
  assert.deepEqual(groups.map(group => group.label), ['Gerencia', 'Comercial', 'Operación', 'Sistema']);
  assert.deepEqual(groups[0].items.map(item => item.label), ['Resumen Ejecutivo', 'Analítica Ventas', 'Cartera', 'Comisiones', 'Presupuestos']);
  assert.deepEqual(groups[1].items.map(item => item.label), ['Clientes', 'Leads', 'Productos por cliente', 'Equipo Ventas']);
  assert.equal(groups[3].items.find(item => item.label === 'Alertas')?.badge, 'notificaciones');
});

test('menú agrupado: cada opción de cada rol está permitida por sus reglas de acceso', () => {
  for (const [role, groups] of Object.entries(MENU_BY_ROLE) as [UserRole, typeof MENU_BY_ROLE[UserRole]][]) {
    for (const item of groups.flatMap(group => group.items)) {
      if (item.href.startsWith('/admin')) continue;
      assert.equal(canAccessDashboardPath(role, item.href), true, `${role} → ${item.href}`);
    }
  }
});

test('menú agrupado: multi-rol fusiona grupos y no repite opciones; clientes sin encabezados', () => {
  const asesoraEditora = buildMenuGroups(['asesor', 'editor_contenido']);
  assert.deepEqual(asesoraEditora.map(group => group.label), ['Comercial', 'Operación', 'Contenido']);
  const comprasYAsesora = buildMenuGroups(['asesor', 'compras']);
  const hrefs = comprasYAsesora.flatMap(group => group.items.map(item => item.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(comprasYAsesora.find(group => group.label === 'Operación')?.items.some(item => item.href === '/dashboard/pedidos'));
  assert.deepEqual(buildMenuGroups(['comprador']).map(group => group.label), [null]);
  assert.equal(isMenuItemActive('/dashboard', '/dashboard$'), true);
  assert.equal(isMenuItemActive('/dashboard/cartera', '/dashboard$'), false);
  assert.equal(isMenuItemActive('/dashboard/cartera', '/dashboard/cartera'), true);
});

test('barra inferior del celular: Gerencia según la propuesta y cada destino permitido para su rol', () => {
  assert.deepEqual(buildMobileDestinations(['direccion']).map(item => [item.label, item.href]), [
    ['Resumen', '/dashboard'], ['Ventas', '/dashboard/analitica'], ['Pedidos', '/dashboard/por-facturar'], ['Cartera', '/dashboard/cartera'],
  ]);
  assert.deepEqual(buildMobileDestinations(['asesor']).map(item => item.label), ['Dashboard', 'Clientes', 'Catálogo', 'Bono']);
  assert.deepEqual(buildMobileDestinations(['cartera']).map(item => item.label), ['Dashboard', 'Cartera']);
  assert.deepEqual(buildMobileDestinations(['compras']).map(item => item.label), ['Compras', 'Pedidos', 'Catálogo']);
  for (const role of ['super_admin', 'direccion', 'asesor', 'compras', 'cartera'] as UserRole[]) {
    for (const item of buildMobileDestinations([role])) assert.equal(canAccessDashboardPath(role, item.href), true, `${role} → ${item.href}`);
  }
});
