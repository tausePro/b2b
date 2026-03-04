'use client';

import { formatCOP, cn } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  AlertTriangle,
  Package,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

const etapas = [
  { nombre: 'Borrador', cantidad: 12, color: 'bg-gray-200' },
  { nombre: 'En Aprobación', cantidad: 8, color: 'bg-yellow-200' },
  { nombre: 'Aprobado', cantidad: 15, color: 'bg-green-200' },
  { nombre: 'Validado', cantidad: 6, color: 'bg-blue-200' },
  { nombre: 'Sincronizado', cantidad: 45, color: 'bg-primary/20' },
];

const alertas = [
  { tipo: 'danger', mensaje: 'Pedido PED-2025-0034 lleva 48 hrs sin aprobación', sede: 'Sede Medellín' },
  { tipo: 'warning', mensaje: 'Pedido PED-2025-0041 pendiente de validación por 24 hrs', sede: 'Sede Cali' },
  { tipo: 'warning', mensaje: '3 pedidos de Sede Norte sin gestionar hoy', sede: 'Sede Norte Bogotá' },
  { tipo: 'danger', mensaje: 'Error de sincronización con Odoo en PED-2025-0028', sede: 'Sede Principal' },
];

const tareasAsesor = [
  { asesor: 'Carlos Mendoza', pendientes: 3, enProceso: 5, completadas: 12, eficiencia: 92 },
  { asesor: 'Ana Rodríguez', pendientes: 2, enProceso: 4, completadas: 10, eficiencia: 88 },
  { asesor: 'Luis Herrera', pendientes: 5, enProceso: 3, completadas: 8, eficiencia: 75 },
  { asesor: 'María López', pendientes: 1, enProceso: 6, completadas: 14, eficiencia: 95 },
];

export default function OperativoPage() {
  const totalEtapas = etapas.reduce((s, e) => s + e.cantidad, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Control Operativo</h1>
        <p className="text-muted text-sm mt-1">Monitoreo en tiempo real de la operación</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Pedidos Retrasados"
          value="4"
          subtitle="Requieren atención"
          icon={<AlertTriangle className="w-5 h-5" />}
        />
        <KpiCard
          title="Pedidos Activos"
          value="41"
          subtitle="En proceso"
          icon={<Package className="w-5 h-5" />}
        />
        <KpiCard
          title="Tiempo Promedio"
          value="3.2 días"
          subtitle="Ciclo completo"
          icon={<Clock className="w-5 h-5" />}
          trend={{ value: '-0.3 días vs semana anterior', positive: true }}
        />
        <KpiCard
          title="Efectividad Total"
          value="87.5%"
          icon={<TrendingUp className="w-5 h-5" />}
          trend={{ value: '+2.3% vs mes anterior', positive: true }}
        />
      </div>

      {/* Mapa de calor: pedidos por etapa */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-4">Mapa de Calor: Pedidos por Etapa</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {etapas.map((etapa) => {
            const pct = totalEtapas > 0 ? (etapa.cantidad / totalEtapas) * 100 : 0;
            return (
              <div key={etapa.nombre} className={cn('rounded-xl p-4 text-center', etapa.color)}>
                <p className="text-2xl font-bold text-foreground">{etapa.cantidad}</p>
                <p className="text-xs font-medium text-foreground/70 mt-1">{etapa.nombre}</p>
                <p className="text-xs text-foreground/50">{pct.toFixed(0)}%</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas críticas */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-danger" />
            Alertas Críticas
          </h2>
          <div className="space-y-3">
            {alertas.map((alerta, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded-lg border',
                  alerta.tipo === 'danger'
                    ? 'bg-danger/5 border-danger/20'
                    : 'bg-warning/5 border-warning/20'
                )}
              >
                <p className="text-sm font-medium text-foreground">{alerta.mensaje}</p>
                <p className="text-xs text-muted mt-1">{alerta.sede}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tareas pendientes por asesor */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Carga por Asesor</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Asesor</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Pend.</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Proceso</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Compl.</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Eficiencia</th>
                </tr>
              </thead>
              <tbody>
                {tareasAsesor.map((t) => (
                  <tr key={t.asesor} className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium text-foreground">{t.asesor}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-warning/10 text-warning text-xs font-bold">
                        {t.pendientes}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-info/10 text-info text-xs font-bold">
                        {t.enProceso}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-success/10 text-success text-xs font-bold">
                        {t.completadas}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-background-light rounded-full h-2">
                          <div
                            className={cn(
                              'h-2 rounded-full',
                              t.eficiencia >= 90 ? 'bg-success' : t.eficiencia >= 80 ? 'bg-primary' : 'bg-warning'
                            )}
                            style={{ width: `${t.eficiencia}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{t.eficiencia}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
