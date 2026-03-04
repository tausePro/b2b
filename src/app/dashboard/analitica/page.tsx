'use client';

import { formatCOP } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import { TrendingUp, DollarSign, ShoppingBag, BarChart3 } from 'lucide-react';

export default function AnaliticaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analítica de Ventas</h1>
        <p className="text-muted text-sm mt-1">Análisis detallado del comportamiento de ventas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ventas Este Mes"
          value={formatCOP(187500000)}
          icon={<DollarSign className="w-5 h-5" />}
          trend={{ value: '+23% vs mes anterior', positive: true }}
        />
        <KpiCard
          title="Pedidos Este Mes"
          value="342"
          icon={<ShoppingBag className="w-5 h-5" />}
          trend={{ value: '+15%', positive: true }}
        />
        <KpiCard
          title="Ticket Promedio"
          value={formatCOP(548246)}
          icon={<TrendingUp className="w-5 h-5" />}
          trend={{ value: '+7%', positive: true }}
        />
        <KpiCard
          title="Tasa Conversión"
          value="94.2%"
          icon={<BarChart3 className="w-5 h-5" />}
          trend={{ value: '+2.1%', positive: true }}
        />
      </div>

      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-4">Evolución de Ventas Mensual</h2>
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted">Gráfico de evolución — se conectará con datos reales de Supabase</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Ventas por Categoría</h2>
          <div className="space-y-3">
            {[
              { label: 'Cafetería', value: 35, amount: 65625000 },
              { label: 'Papelería', value: 28, amount: 52500000 },
              { label: 'Aseo', value: 22, amount: 41250000 },
              { label: 'Personalizados', value: 15, amount: 28125000 },
            ].map((cat) => (
              <div key={cat.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">{cat.label}</span>
                  <span className="text-muted">{formatCOP(cat.amount)} ({cat.value}%)</span>
                </div>
                <div className="w-full bg-background-light rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `${cat.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Top Clientes por Volumen</h2>
          <div className="space-y-3">
            {[
              { nombre: 'Grupo Empresarial ABC', valor: 42300000 },
              { nombre: 'Servicios Integrados', valor: 41200000 },
              { nombre: 'Corporación XYZ', valor: 35800000 },
              { nombre: 'Industrias del Valle', valor: 28900000 },
            ].map((c, i) => (
              <div key={c.nombre} className="flex items-center gap-3 py-2">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">{c.nombre}</span>
                <span className="text-sm font-semibold">{formatCOP(c.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
