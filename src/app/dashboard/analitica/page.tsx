'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCOP } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Building2,
  Loader2,
  BarChart3,
} from 'lucide-react';

interface TopEmpresa {
  id: string;
  nombre: string;
  pedidos_count: number;
  valor_total: number;
}

interface MesData {
  mes: string;
  label: string;
  pedidos: number;
  valor: number;
}

export default function AnaliticaPage() {
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [ventasMes, setVentasMes] = useState(0);
  const [pedidosMes, setPedidosMes] = useState(0);
  const [ventasMesAnterior, setVentasMesAnterior] = useState(0);
  const [pedidosMesAnterior, setPedidosMesAnterior] = useState(0);
  const [topEmpresas, setTopEmpresas] = useState<TopEmpresa[]>([]);
  const [ventasPorMes, setVentasPorMes] = useState<MesData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const now = new Date();
      const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;

      // Mes anterior
      const mesAntDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const inicioMesAnt = `${mesAntDate.getFullYear()}-${String(mesAntDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
      const finMesAnt = inicioMes;

      const [pedidosMesRes, pedidosMesAntRes, empresasRes] = await Promise.allSettled([
        supabase.from('pedidos').select('valor_total_cop, empresa_id').gte('fecha_creacion', inicioMes),
        supabase.from('pedidos').select('valor_total_cop').gte('fecha_creacion', inicioMesAnt).lt('fecha_creacion', finMesAnt),
        supabase.from('empresas').select('id, nombre').eq('activa', true),
      ]);

      // Pedidos mes actual
      let pedidosMesData: { valor_total_cop: number | null; empresa_id: string }[] = [];
      if (pedidosMesRes.status === 'fulfilled' && pedidosMesRes.value.data) {
        pedidosMesData = pedidosMesRes.value.data as { valor_total_cop: number | null; empresa_id: string }[];
        const total = pedidosMesData.reduce((s, p) => s + (p.valor_total_cop || 0), 0);
        setVentasMes(total);
        setPedidosMes(pedidosMesData.length);
      }

      // Pedidos mes anterior (para tendencia)
      if (pedidosMesAntRes.status === 'fulfilled' && pedidosMesAntRes.value.data) {
        const dataAnt = pedidosMesAntRes.value.data as { valor_total_cop: number | null }[];
        setVentasMesAnterior(dataAnt.reduce((s, p) => s + (p.valor_total_cop || 0), 0));
        setPedidosMesAnterior(dataAnt.length);
      }

      // Top empresas por volumen del mes
      if (empresasRes.status === 'fulfilled' && empresasRes.value.data) {
        const empresas = empresasRes.value.data;
        // Agrupar pedidos del mes por empresa
        const ventasPorEmpresa: Record<string, number> = {};
        const pedidosPorEmpresa: Record<string, number> = {};
        for (const p of pedidosMesData) {
          ventasPorEmpresa[p.empresa_id] = (ventasPorEmpresa[p.empresa_id] || 0) + (p.valor_total_cop || 0);
          pedidosPorEmpresa[p.empresa_id] = (pedidosPorEmpresa[p.empresa_id] || 0) + 1;
        }

        const topEmp: TopEmpresa[] = empresas
          .map((emp) => ({
            id: emp.id,
            nombre: emp.nombre,
            pedidos_count: pedidosPorEmpresa[emp.id] || 0,
            valor_total: ventasPorEmpresa[emp.id] || 0,
          }))
          .filter((e) => e.valor_total > 0)
          .sort((a, b) => b.valor_total - a.valor_total)
          .slice(0, 5);

        setTopEmpresas(topEmp);
      }

      // Evolución últimos 6 meses
      const mesesData: MesData[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
        const dFin = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const fin = `${dFin.getFullYear()}-${String(dFin.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
        const label = d.toLocaleString('es-CO', { month: 'short', year: '2-digit' });

        const { data: pedidosMesI } = await supabase
          .from('pedidos')
          .select('valor_total_cop')
          .gte('fecha_creacion', ini)
          .lt('fecha_creacion', fin);

        const pedidos = pedidosMesI ?? [];
        mesesData.push({
          mes: ini,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          pedidos: pedidos.length,
          valor: pedidos.reduce((s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0), 0),
        });
      }
      setVentasPorMes(mesesData);

      setLoading(false);
    };

    fetchData();
  }, []);

  const ticketPromedio = pedidosMes > 0 ? Math.round(ventasMes / pedidosMes) : 0;

  // Tendencias
  const trendVentas = ventasMesAnterior > 0
    ? ((ventasMes - ventasMesAnterior) / ventasMesAnterior) * 100
    : 0;
  const trendPedidos = pedidosMesAnterior > 0
    ? ((pedidosMes - pedidosMesAnterior) / pedidosMesAnterior) * 100
    : 0;

  // Max valor para barras de evolución
  const maxValorMes = Math.max(...ventasPorMes.map((m) => m.valor), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analítica de Ventas</h1>
        <p className="text-muted text-sm mt-1">Análisis detallado del comportamiento de ventas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ventas Este Mes"
          value={formatCOP(ventasMes)}
          icon={<DollarSign className="w-5 h-5" />}
          trend={ventasMesAnterior > 0 ? {
            value: `${trendVentas >= 0 ? '+' : ''}${trendVentas.toFixed(0)}% vs mes anterior`,
            positive: trendVentas >= 0,
          } : undefined}
        />
        <KpiCard
          title="Pedidos Este Mes"
          value={String(pedidosMes)}
          icon={<ShoppingBag className="w-5 h-5" />}
          trend={pedidosMesAnterior > 0 ? {
            value: `${trendPedidos >= 0 ? '+' : ''}${trendPedidos.toFixed(0)}%`,
            positive: trendPedidos >= 0,
          } : undefined}
        />
        <KpiCard
          title="Ticket Promedio"
          value={formatCOP(ticketPromedio)}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <KpiCard
          title="Empresas con Pedidos"
          value={String(topEmpresas.length)}
          subtitle="Este mes"
          icon={<Building2 className="w-5 h-5" />}
        />
      </div>

      {/* Evolución de ventas - barras simples */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-4">Evolución de Ventas — Últimos 6 Meses</h2>
        {ventasPorMes.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">Sin datos suficientes.</p>
        ) : (
          <div className="flex items-end gap-3 h-48">
            {ventasPorMes.map((m) => {
              const pct = maxValorMes > 0 ? (m.valor / maxValorMes) * 100 : 0;
              return (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-foreground">
                    {formatCOP(m.valor)}
                  </span>
                  <div className="w-full flex items-end" style={{ height: '140px' }}>
                    <div
                      className="w-full bg-primary/80 rounded-t-md transition-all"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted">{m.label}</span>
                  <span className="text-xs text-muted">{m.pedidos} ped.</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Clientes */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Top Clientes por Volumen</h2>
            <div className="flex items-center gap-1 text-xs text-muted">
              <BarChart3 className="w-3.5 h-3.5" />
              Mes actual
            </div>
          </div>
          {topEmpresas.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Sin pedidos este mes.</p>
          ) : (
            <div className="space-y-3">
              {topEmpresas.map((emp, i) => (
                <div key={emp.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{emp.nombre}</p>
                    <p className="text-xs text-muted">{emp.pedidos_count} pedidos</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCOP(emp.valor_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen por Mes */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4">Detalle por Mes</h2>
          {ventasPorMes.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Sin datos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium text-muted">Mes</th>
                    <th className="text-right py-2 font-medium text-muted">Pedidos</th>
                    <th className="text-right py-2 font-medium text-muted">Valor</th>
                    <th className="text-right py-2 font-medium text-muted">Ticket Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasPorMes.map((m) => (
                    <tr key={m.mes} className="border-b border-border/50">
                      <td className="py-2 font-medium text-foreground">{m.label}</td>
                      <td className="py-2 text-right">{m.pedidos}</td>
                      <td className="py-2 text-right font-semibold">{formatCOP(m.valor)}</td>
                      <td className="py-2 text-right text-muted">
                        {m.pedidos > 0 ? formatCOP(Math.round(m.valor / m.pedidos)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
