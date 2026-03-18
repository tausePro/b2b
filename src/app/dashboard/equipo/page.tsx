'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCOP } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  DollarSign,
  ShoppingBag,
  Building2,
  Users,
  Loader2,
} from 'lucide-react';

interface AsesorRanking {
  id: string;
  nombre: string;
  apellido: string;
  activo: boolean;
  empresas_count: number;
  pedidos_count: number;
  valor_total: number;
  ticket_promedio: number;
}

const supabase = createClient();

export default function EquipoPage() {
  const [loading, setLoading] = useState(true);
  const [asesores, setAsesores] = useState<AsesorRanking[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const now = new Date();
      const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;

      // Obtener todos los asesores activos
      const { data: asesoresList } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, activo')
        .eq('rol', 'asesor')
        .eq('activo', true)
        .order('nombre');

      if (!asesoresList || asesoresList.length === 0) {
        setAsesores([]);
        setLoading(false);
        return;
      }

      // Para cada asesor, calcular métricas reales
      const rankings: AsesorRanking[] = await Promise.all(
        asesoresList.map(async (asesor) => {
          // Empresas asignadas
          const { data: asignaciones } = await supabase
            .from('asesor_empresas')
            .select('empresa_id')
            .eq('usuario_id', asesor.id)
            .eq('activo', true);

          const empresaIds = asignaciones?.map((a) => a.empresa_id) || [];
          let pedidos_count = 0;
          let valor_total = 0;

          if (empresaIds.length > 0) {
            const { data: pedidos } = await supabase
              .from('pedidos')
              .select('valor_total_cop')
              .in('empresa_id', empresaIds)
              .gte('fecha_creacion', inicioMes);

            if (pedidos) {
              pedidos_count = pedidos.length;
              valor_total = pedidos.reduce(
                (s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0),
                0
              );
            }
          }

          return {
            id: asesor.id,
            nombre: asesor.nombre,
            apellido: asesor.apellido,
            activo: asesor.activo,
            empresas_count: empresaIds.length,
            pedidos_count,
            valor_total,
            ticket_promedio: pedidos_count > 0 ? Math.round(valor_total / pedidos_count) : 0,
          };
        })
      );

      // Ordenar por valor total descendente
      rankings.sort((a, b) => b.valor_total - a.valor_total);
      setAsesores(rankings);
      setLoading(false);
    };

    fetchData();
  }, []);

  const totalVentas = asesores.reduce((s, a) => s + a.valor_total, 0);
  const totalPedidos = asesores.reduce((s, a) => s + a.pedidos_count, 0);
  const ticketGlobal = totalPedidos > 0 ? Math.round(totalVentas / totalPedidos) : 0;

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
        <h1 className="text-2xl font-bold text-foreground">Rendimiento Equipo de Ventas</h1>
        <p className="text-muted text-sm mt-1">Métricas de desempeño del equipo comercial — mes actual</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ventas Totales"
          value={formatCOP(totalVentas)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Pedidos Procesados"
          value={String(totalPedidos)}
          icon={<ShoppingBag className="w-5 h-5" />}
        />
        <KpiCard
          title="Ticket Promedio"
          value={formatCOP(ticketGlobal)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Asesores Activos"
          value={String(asesores.length)}
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      {/* Ranking de asesores */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Ranking de Asesores</h2>
          <p className="text-xs text-muted mt-0.5">Ordenado por volumen de ventas del mes</p>
        </div>
        {asesores.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-muted">No hay asesores activos registrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-center py-3 px-4 font-medium text-muted w-12">#</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Asesor</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Ventas Totales</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Pedidos</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Ticket Promedio</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Empresas</th>
                </tr>
              </thead>
              <tbody>
                {asesores.map((asesor, i) => (
                  <tr key={asesor.id} className="border-b border-border/50 hover:bg-background-light/30">
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
                            {asesor.nombre[0]}{asesor.apellido[0]}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">
                          {asesor.nombre} {asesor.apellido}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCOP(asesor.valor_total)}</td>
                    <td className="py-3 px-4 text-right">{asesor.pedidos_count}</td>
                    <td className="py-3 px-4 text-right text-muted">{formatCOP(asesor.ticket_promedio)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Building2 className="w-3 h-3" />
                        {asesor.empresas_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
