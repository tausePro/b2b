import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessDashboardPath } from '../src/lib/auth/routeAccess';
import {
  buildOrderMetricsReport,
  buildOrdersCsv,
  buildProductsCsv,
  defaultOrderReportRange,
  validateOrderReportRange,
  type OrderItemRecord,
  type OrderRecord,
  type SiteBudgetRecord,
} from '../src/lib/informes/pedidos';

test('habilita acceso a /dashboard/reportes tanto para comprador como para aprobador', () => {
  assert.equal(canAccessDashboardPath('comprador', '/dashboard/reportes'), true);
  assert.equal(canAccessDashboardPath('aprobador', '/dashboard/reportes'), true);
  assert.equal(canAccessDashboardPath('asesor', '/dashboard/reportes'), true);
  assert.equal(canAccessDashboardPath('direccion', '/dashboard/reportes'), true);
});

test('valida el rango de fechas de informes de pedidos y calcula rango por defecto de 6 meses', () => {
  const range = defaultOrderReportRange('2026-10-28');
  assert.deepEqual(range, { from: '2026-05-01', to: '2026-10-28' });
  assert.deepEqual(validateOrderReportRange('2026-09-01', '2026-10-28', '2026-10-28'), {
    from: '2026-09-01',
    to: '2026-10-28',
  });
  assert.throws(() => validateOrderReportRange('2026-10-29', '2026-10-28', '2026-10-28'));
  assert.throws(() => validateOrderReportRange('2026-10-01', '2026-10-29', '2026-10-28'));
});

const sampleOrders: OrderRecord[] = [
  {
    id: 'order-1',
    numero: 'PED-2026-0101',
    empresaId: 'emp-1',
    empresaNombre: 'Cliente Corporativo',
    sedeId: 'sede-1',
    sedeNombre: 'Sede Norte',
    sedeCiudad: 'Bogotá',
    creadorId: 'user-1',
    creadorNombre: 'Ana Compradora',
    creadorEmail: 'ana@cliente.co',
    estado: 'procesado_odoo',
    odooSaleOrderId: 901,
    valorTotalCop: 300000,
    totalItems: 2,
    excedePresupuesto: false,
    fechaCreacion: '2026-10-10T14:00:00.000Z',
    fechaCreacionDate: '2026-10-10',
    fechaAprobacion: '2026-10-10T16:00:00.000Z',
    fechaValidacion: '2026-10-10T19:00:00.000Z',
  },
  {
    id: 'order-2',
    numero: 'PED-2026-0102',
    empresaId: 'emp-1',
    empresaNombre: 'Cliente Corporativo',
    sedeId: 'sede-2',
    sedeNombre: 'Sede Sur',
    sedeCiudad: 'Medellín',
    creadorId: 'user-2',
    creadorNombre: 'Carlos Solicitante',
    creadorEmail: 'carlos@cliente.co',
    estado: 'en_aprobacion',
    odooSaleOrderId: null,
    valorTotalCop: 150000,
    totalItems: 1,
    excedePresupuesto: true,
    fechaCreacion: '2026-10-15T15:00:00.000Z',
    fechaCreacionDate: '2026-10-15',
    fechaAprobacion: null,
    fechaValidacion: null,
  },
  {
    id: 'order-prev',
    numero: 'PED-2026-0080',
    empresaId: 'emp-1',
    empresaNombre: 'Cliente Corporativo',
    sedeId: 'sede-1',
    sedeNombre: 'Sede Norte',
    sedeCiudad: 'Bogotá',
    creadorId: 'user-1',
    creadorNombre: 'Ana Compradora',
    creadorEmail: 'ana@cliente.co',
    estado: 'aprobado',
    odooSaleOrderId: 850,
    valorTotalCop: 200000,
    totalItems: 1,
    excedePresupuesto: false,
    fechaCreacion: '2026-09-12T14:00:00.000Z',
    fechaCreacionDate: '2026-09-12',
    fechaAprobacion: '2026-09-12T15:00:00.000Z',
    fechaValidacion: null,
  },
];

const sampleItems: OrderItemRecord[] = [
  {
    id: 'item-1',
    pedidoId: 'order-1',
    tipoItem: 'catalogo',
    odooProductId: 501,
    nombreProducto: 'Resma Papel Carta',
    unidad: 'Resma',
    referenciaCliente: null,
    cantidad: 10,
    precioUnitarioCop: 20000,
    subtotalCop: 200000,
  },
  {
    id: 'item-2',
    pedidoId: 'order-1',
    tipoItem: 'catalogo',
    odooProductId: 502,
    nombreProducto: 'Café Molido 500g',
    unidad: 'Bolsa',
    referenciaCliente: null,
    cantidad: 5,
    precioUnitarioCop: 20000,
    subtotalCop: 100000,
  },
  {
    id: 'item-3',
    pedidoId: 'order-2',
    tipoItem: 'catalogo',
    odooProductId: 501,
    nombreProducto: 'Resma Papel Carta',
    unidad: 'Resma',
    referenciaCliente: null,
    cantidad: 7.5,
    precioUnitarioCop: 20000,
    subtotalCop: 150000,
  },
];

const sampleBudgets: SiteBudgetRecord[] = [
  {
    sedeId: 'sede-1',
    sedeNombre: 'Sede Norte',
    ciudad: 'Bogotá',
    empresaId: 'emp-1',
    presupuestoAsignadoSede: 500000,
    alertaThreshold: 90,
    montoInicialMes: 500000,
    montoConsumidoMes: 300000,
    montoDisponibleMes: 200000,
    estadoPresupuestoMes: 'activo',
  },
  {
    sedeId: 'sede-2',
    sedeNombre: 'Sede Sur',
    ciudad: 'Medellín',
    empresaId: 'emp-1',
    presupuestoAsignadoSede: 100000,
    alertaThreshold: 85,
    montoInicialMes: 100000,
    montoConsumidoMes: 150000,
    montoDisponibleMes: -50000,
    estadoPresupuestoMes: 'excedido',
  },
];

test('consolida KPIs, productos, sedes, solicitantes y tiempos cuando showPrices=true', () => {
  const report = buildOrderMetricsReport({
    orders: sampleOrders,
    items: sampleItems,
    siteBudgets: sampleBudgets,
    empresas: [{ id: 'emp-1', nombre: 'Cliente Corporativo', nit: '900123456', presupuestoGlobalMensual: 1000000 }],
    sedes: [
      { id: 'sede-1', nombre: 'Sede Norte', ciudad: 'Bogotá', empresaId: 'emp-1' },
      { id: 'sede-2', nombre: 'Sede Sur', ciudad: 'Medellín', empresaId: 'emp-1' },
    ],
    range: { from: '2026-10-01', to: '2026-10-28' },
    filters: { empresaId: 'emp-1', sedeId: null, estado: 'todos' },
    showPrices: true,
    generatedAt: '2026-10-28T12:00:00.000Z',
  });

  assert.equal(report.kpis.totalOrders, 2);
  assert.equal(report.kpis.previousTotalOrders, 1);
  assert.equal(report.kpis.ordersChangePercent, 100);
  assert.equal(report.kpis.totalValueCop, 450000);
  assert.equal(report.kpis.previousTotalValueCop, 200000);
  assert.equal(report.kpis.valueChangePercent, 125);
  assert.equal(report.kpis.approvedValueCop, 300000);
  assert.equal(report.kpis.pendingApprovalValueCop, 150000);
  assert.equal(report.kpis.avgTicketCop, 225000);
  assert.equal(report.kpis.totalUnits, 22.5);
  assert.equal(report.kpis.avgApprovalHours, 2);
  assert.equal(report.kpis.avgValidationHours, 3);
  assert.equal(report.kpis.exceededBudgetOrders, 1);

  assert.equal(report.topProducts.length, 2);
  assert.equal(report.topProducts[0].odooProductId, 501);
  assert.equal(report.topProducts[0].orderCount, 2);
  assert.equal(report.topProducts[0].totalQuantity, 17.5);
  assert.equal(report.topProducts[0].subtotalCop, 350000);

  const sedeNorte = report.bySite.find((s) => s.sedeId === 'sede-1');
  assert.ok(sedeNorte);
  assert.equal(sedeNorte.budgetExecutionPercent, 60);
  assert.equal(sedeNorte.budgetAvailableMonthCop, 200000);

  const csvOrders = buildOrdersCsv(report);
  const csvProducts = buildProductsCsv(report);
  assert.ok(csvOrders.startsWith('\uFEFFPedido;Fecha;Empresa;Sede'));
  assert.ok(csvOrders.includes('PED-2026-0101'));
  assert.ok(csvProducts.includes('Resma Papel Carta;501;Catálogo;Resma;2;17.5'));
});

test('oculta valores monetarios en el informe y exportación cuando showPrices=false', () => {
  const report = buildOrderMetricsReport({
    orders: sampleOrders,
    items: sampleItems,
    siteBudgets: sampleBudgets,
    empresas: [{ id: 'emp-1', nombre: 'Cliente Corporativo', nit: '900123456', presupuestoGlobalMensual: 1000000 }],
    sedes: [
      { id: 'sede-1', nombre: 'Sede Norte', ciudad: 'Bogotá', empresaId: 'emp-1' },
      { id: 'sede-2', nombre: 'Sede Sur', ciudad: 'Medellín', empresaId: 'emp-1' },
    ],
    range: { from: '2026-10-01', to: '2026-10-28' },
    filters: { empresaId: 'emp-1', sedeId: null, estado: 'todos' },
    showPrices: false,
    generatedAt: '2026-10-28T12:00:00.000Z',
  });

  assert.equal(report.kpis.totalValueCop, null);
  assert.equal(report.kpis.avgTicketCop, null);
  assert.equal(report.kpis.approvedValueCop, null);
  assert.equal(report.kpis.totalUnits, 22.5);
  assert.equal(report.topProducts[0].subtotalCop, null);
  assert.equal(report.orders[0].valorTotalCop, null);

  const csvOrders = buildOrdersCsv(report);
  assert.equal(csvOrders.includes('Valor Total COP'), false);
  assert.equal(csvOrders.includes('300000'), false);
});
