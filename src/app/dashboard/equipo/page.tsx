'use client';

import { formatCOP } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  DollarSign,
  ShoppingBag,
  Clock,
  Users,
  Circle,
} from 'lucide-react';

const asesores = [
  { nombre: 'Carlos Mendoza', ventas: 45200000, pedidos: 67, ticket: 674627, tiempo: '1.8 hrs', online: true },
  { nombre: 'Ana Rodríguez', ventas: 38900000, pedidos: 54, ticket: 720370, tiempo: '2.1 hrs', online: true },
  { nombre: 'Luis Herrera', ventas: 35100000, pedidos: 48, ticket: 731250, tiempo: '2.5 hrs', online: false },
  { nombre: 'María López', ventas: 31800000, pedidos: 42, ticket: 757143, tiempo: '1.9 hrs', online: true },
  { nombre: 'Pedro Gómez', ventas: 28500000, pedidos: 38, ticket: 750000, tiempo: '3.2 hrs', online: false },
  { nombre: 'Laura Torres', ventas: 25300000, pedidos: 35, ticket: 722857, tiempo: '2.8 hrs', online: true },
];

export default function EquipoPage() {
  const totalVentas = asesores.reduce((s, a) => s + a.ventas, 0);
  const totalPedidos = asesores.reduce((s, a) => s + a.pedidos, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rendimiento Equipo de Ventas</h1>
        <p className="text-muted text-sm mt-1">Métricas de desempeño del equipo comercial</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ventas Totales"
          value={formatCOP(totalVentas)}
          icon={<DollarSign className="w-5 h-5" />}
          trend={{ value: '+18% vs mes anterior', positive: true }}
        />
        <KpiCard
          title="Pedidos Procesados"
          value={String(totalPedidos)}
          icon={<ShoppingBag className="w-5 h-5" />}
          trend={{ value: '+12% vs mes anterior', positive: true }}
        />
        <KpiCard
          title="Tiempo Respuesta Prom."
          value="2.4 hrs"
          icon={<Clock className="w-5 h-5" />}
          trend={{ value: '-20 min vs mes anterior', positive: true }}
        />
        <KpiCard
          title="Asesores Activos"
          value={`${asesores.filter((a) => a.online).length}/${asesores.length}`}
          subtitle="En línea ahora"
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      {/* Ranking de asesores */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Ranking de Asesores</h2>
          <p className="text-xs text-muted mt-0.5">Ordenado por volumen de ventas</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background-light/50">
                <th className="text-center py-3 px-4 font-medium text-muted w-12">#</th>
                <th className="text-left py-3 px-4 font-medium text-muted">Asesor</th>
                <th className="text-right py-3 px-4 font-medium text-muted">Ventas Totales</th>
                <th className="text-right py-3 px-4 font-medium text-muted">Pedidos</th>
                <th className="text-right py-3 px-4 font-medium text-muted">Ticket Promedio</th>
                <th className="text-right py-3 px-4 font-medium text-muted">Tiempo Resp.</th>
                <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
              </tr>
            </thead>
            <tbody>
              {asesores.map((asesor, i) => (
                <tr key={asesor.nombre} className="border-b border-border/50 hover:bg-background-light/30">
                  <td className="py-3 px-4 text-center">
                    <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                      i < 3 ? 'bg-primary/10 text-primary' : 'bg-background-light text-muted'
                    }`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {asesor.nombre.split(' ').map((n) => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium text-foreground">{asesor.nombre}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCOP(asesor.ventas)}</td>
                  <td className="py-3 px-4 text-right">{asesor.pedidos}</td>
                  <td className="py-3 px-4 text-right text-muted">{formatCOP(asesor.ticket)}</td>
                  <td className="py-3 px-4 text-right text-muted">{asesor.tiempo}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      asesor.online ? 'text-success' : 'text-muted'
                    }`}>
                      <Circle className={`w-2 h-2 ${asesor.online ? 'fill-success' : 'fill-muted'}`} />
                      {asesor.online ? 'En línea' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
