'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingBag,
  Building2,
  ArrowRight,
  TrendingUp,
  Users,
  Loader2,
  MapPin,
} from 'lucide-react';

interface EmpresaTop {
  id: string;
  nombre: string;
  sedes_count: number;
  pedidos_count: number;
  valor_total: number;
}

interface AsesorTop {
  id: string;
  nombre: string;
  apellido: string;
  empresas_count: number;
  pedidos_count: number;
  valor_total: number;
}

const supabase = createClient();

export default function DashboardDireccion() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalEmpresas, setTotalEmpresas] = useState(0);
  const [totalPedidosMes, setTotalPedidosMes] = useState(0);
  const [totalValorMes, setTotalValorMes] = useState(0);
  const [totalAsesores, setTotalAsesores] = useState(0);
  const [topEmpresas, setTopEmpresas] = useState<EmpresaTop[]>([]);
  const [topAsesores, setTopAsesores] = useState<AsesorTop[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const now = new Date();
      const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;

      const [empresasRes, pedidosMesRes, asesoresRes, empresasListRes] = await Promise.allSettled([
        supabase.from('empresas').select('id', { count: 'exact', head: true }).eq('activa', true),
        supabase.from('pedidos').select('valor_total_cop, empresa_id').gte('created_at', inicioMes),
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('rol', 'asesor').eq('activo', true),
        supabase.from('empresas').select('id, nombre').eq('activa', true).order('nombre'),
      ]);

      // Total empresas
      if (empresasRes.status === 'fulfilled') {
        setTotalEmpresas(empresasRes.value.count ?? 0);
      }

      // Pedidos del mes
      let pedidosMesData: { valor_total_cop: number | null; empresa_id: string }[] = [];
      if (pedidosMesRes.status === 'fulfilled' && pedidosMesRes.value.data) {
        pedidosMesData = pedidosMesRes.value.data as { valor_total_cop: number | null; empresa_id: string }[];
        setTotalPedidosMes(pedidosMesData.length);
        setTotalValorMes(pedidosMesData.reduce((s, p) => s + (p.valor_total_cop || 0), 0));
      }

      // Total asesores
      if (asesoresRes.status === 'fulfilled') {
        setTotalAsesores(asesoresRes.value.count ?? 0);
      }

      // Top empresas por valor
      if (empresasListRes.status === 'fulfilled' && empresasListRes.value.data) {
        const empresas = empresasListRes.value.data;
        const topEmp: EmpresaTop[] = await Promise.all(
          empresas.slice(0, 10).map(async (emp) => {
            const [sedesRes, pedidosRes] = await Promise.allSettled([
              supabase.from('sedes').select('id', { count: 'exact', head: true }).eq('empresa_id', emp.id),
              supabase.from('pedidos').select('valor_total_cop').eq('empresa_id', emp.id).gte('created_at', inicioMes),
            ]);

            const sedes_count = sedesRes.status === 'fulfilled' ? (sedesRes.value.count ?? 0) : 0;
            let pedidos_count = 0;
            let valor_total = 0;
            if (pedidosRes.status === 'fulfilled' && pedidosRes.value.data) {
              pedidos_count = pedidosRes.value.data.length;
              valor_total = pedidosRes.value.data.reduce(
                (s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0), 0
              );
            }

            return { id: emp.id, nombre: emp.nombre, sedes_count, pedidos_count, valor_total };
          })
        );

        setTopEmpresas(topEmp.sort((a, b) => b.valor_total - a.valor_total).slice(0, 5));
      }

      // Top asesores
      const { data: asesoresList } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido')
        .eq('rol', 'asesor')
        .eq('activo', true);

      if (asesoresList) {
        const topAs: AsesorTop[] = await Promise.all(
          asesoresList.map(async (asesor) => {
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
                .gte('created_at', inicioMes);

              if (pedidos) {
                pedidos_count = pedidos.length;
                valor_total = pedidos.reduce(
                  (s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0), 0
                );
              }
            }

            return {
              id: asesor.id,
              nombre: asesor.nombre,
              apellido: asesor.apellido,
              empresas_count: empresaIds.length,
              pedidos_count,
              valor_total,
            };
          })
        );

        setTopAsesores(topAs.sort((a, b) => b.valor_total - a.valor_total).slice(0, 5));
      }

      setLoading(false);
    };

    fetchData();
  }, []);

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
        <h1 className="text-2xl font-bold text-foreground">
          Resumen Ejecutivo
        </h1>
        <p className="text-muted text-sm mt-1">
          Vista global del rendimiento de la plataforma
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ventas del Mes"
          value={formatCOP(totalValorMes)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Pedidos del Mes"
          value={String(totalPedidosMes)}
          icon={<ShoppingBag className="w-5 h-5" />}
        />
        <KpiCard
          title="Empresas Activas"
          value={String(totalEmpresas)}
          icon={<Building2 className="w-5 h-5" />}
        />
        <KpiCard
          title="Asesores Activos"
          value={String(totalAsesores)}
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      {/* Top asesores y Top clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Top Asesores Comerciales</h2>
            <Link href="/dashboard/equipo" className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1">
              Ver equipo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {topAsesores.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No hay asesores registrados.</p>
          ) : (
            <div className="space-y-3">
              {topAsesores.map((asesor, i) => (
                <div key={asesor.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{asesor.nombre} {asesor.apellido}</p>
                    <p className="text-xs text-muted">{asesor.empresas_count} clientes · {asesor.pedidos_count} pedidos</p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{formatCOP(asesor.valor_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Top Clientes Corporativos</h2>
            <div className="flex items-center gap-1 text-sm text-muted">
              <TrendingUp className="w-4 h-4" />
              <span>Por volumen del mes</span>
            </div>
          </div>
          {topEmpresas.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No hay empresas registradas.</p>
          ) : (
            <div className="space-y-3">
              {topEmpresas.map((emp, i) => (
                <div key={emp.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{emp.nombre}</p>
                    <p className="text-xs text-muted flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{emp.sedes_count} sedes</span>
                      <span>· {emp.pedidos_count} pedidos</span>
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{formatCOP(emp.valor_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
