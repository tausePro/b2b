'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { cn, formatCOP } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import Link from 'next/link';
import {
  DollarSign,
  CheckSquare,
  Clock,
  ArrowRight,
  Loader2,
  MapPin,
} from 'lucide-react';

interface PedidoPendiente {
  id: string;
  numero: string;
  estado: string;
  valor_total_cop: number | null;
  created_at: string;
  excede_presupuesto: boolean;
  usuario_creador: { nombre: string; apellido: string } | null;
  sede: { nombre: string } | null;
}

interface PresupuestoSede {
  sede_nombre: string;
  monto_inicial: number;
  monto_consumido: number;
  monto_disponible: number;
}

const supabase = createClient();

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: 'bg-slate-100 text-slate-600' },
  en_aprobacion: { label: 'En Aprobación', color: 'bg-amber-100 text-amber-700' },
  aprobado: { label: 'Aprobado', color: 'bg-blue-100 text-blue-700' },
  en_validacion_imprima: { label: 'En Validación', color: 'bg-purple-100 text-purple-700' },
  procesado_odoo: { label: 'Procesado', color: 'bg-green-100 text-green-700' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  cancelado: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500' },
};

export default function DashboardAprobador() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendientesCount, setPendientesCount] = useState(0);
  const [valorPendiente, setValorPendiente] = useState(0);
  const [aprobadosMes, setAprobadosMes] = useState(0);
  const [valorAprobadoMes, setValorAprobadoMes] = useState(0);
  const [pedidosPendientes, setPedidosPendientes] = useState<PedidoPendiente[]>([]);
  const [presupuestos, setPresupuestos] = useState<PresupuestoSede[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.empresa_id) return;
      setLoading(true);

      const now = new Date();
      const mesActual = now.getMonth() + 1;
      const anioActual = now.getFullYear();
      const inicioMes = `${anioActual}-${String(mesActual).padStart(2, '0')}-01T00:00:00`;

      const [pendientesRes, aprobadosRes, pedidosListRes, presupuestosRes] = await Promise.allSettled([
        supabase
          .from('pedidos')
          .select('valor_total_cop')
          .eq('empresa_id', user.empresa_id)
          .eq('estado', 'en_aprobacion'),
        supabase
          .from('pedidos')
          .select('valor_total_cop')
          .eq('empresa_id', user.empresa_id)
          .eq('estado', 'aprobado')
          .gte('created_at', inicioMes),
        supabase
          .from('pedidos')
          .select('id, numero, estado, valor_total_cop, created_at, excede_presupuesto, usuario_creador:usuarios!pedidos_usuario_creador_id_fkey(nombre, apellido), sede:sedes(nombre)')
          .eq('empresa_id', user.empresa_id)
          .eq('estado', 'en_aprobacion')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('presupuestos_mensuales')
          .select('monto_inicial, monto_consumido, monto_disponible, sede:sedes(nombre)')
          .eq('mes', mesActual)
          .eq('anio', anioActual),
      ]);

      // Pendientes
      if (pendientesRes.status === 'fulfilled' && pendientesRes.value.data) {
        const data = pendientesRes.value.data;
        setPendientesCount(data.length);
        setValorPendiente(data.reduce((s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0), 0));
      }

      // Aprobados del mes
      if (aprobadosRes.status === 'fulfilled' && aprobadosRes.value.data) {
        const data = aprobadosRes.value.data;
        setAprobadosMes(data.length);
        setValorAprobadoMes(data.reduce((s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0), 0));
      }

      // Lista de pedidos pendientes
      if (pedidosListRes.status === 'fulfilled' && pedidosListRes.value.data) {
        setPedidosPendientes(pedidosListRes.value.data as unknown as PedidoPendiente[]);
      }

      // Presupuestos por sede
      if (presupuestosRes.status === 'fulfilled' && presupuestosRes.value.data) {
        setPresupuestos(
          presupuestosRes.value.data.map((p: Record<string, unknown>) => ({
            sede_nombre: (p.sede as { nombre: string } | null)?.nombre || 'Sin sede',
            monto_inicial: p.monto_inicial as number,
            monto_consumido: p.monto_consumido as number,
            monto_disponible: p.monto_disponible as number,
          }))
        );
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Hace minutos';
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

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
          Panel de Aprobación
        </h1>
        <p className="text-muted text-sm mt-1">
          Gestiona las aprobaciones de pedidos de tus sedes
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Valor Pendiente"
          value={formatCOP(valorPendiente)}
          subtitle={`${pendientesCount} pedido${pendientesCount !== 1 ? 's' : ''} por aprobar`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Aprobados este Mes"
          value={formatCOP(valorAprobadoMes)}
          subtitle={`${aprobadosMes} pedido${aprobadosMes !== 1 ? 's' : ''}`}
          icon={<CheckSquare className="w-5 h-5" />}
        />
        <KpiCard
          title="Pendientes"
          value={String(pendientesCount)}
          subtitle="Requieren tu aprobación"
          icon={<Clock className="w-5 h-5" />}
        />
        <KpiCard
          title="Sedes con Presupuesto"
          value={String(presupuestos.length)}
          subtitle="Este mes"
          icon={<MapPin className="w-5 h-5" />}
        />
      </div>

      {/* Pedidos pendientes de aprobación */}
      <div className="bg-white rounded-xl border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Pedidos Pendientes de Aprobación</h2>
          <Link href="/dashboard/aprobaciones" className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1">
            Ver todos <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {pedidosPendientes.length === 0 ? (
          <div className="p-8 text-center">
            <CheckSquare className="w-8 h-8 text-border mx-auto mb-2" />
            <p className="text-sm text-muted">No hay pedidos pendientes de aprobación.</p>
            <p className="text-xs text-muted mt-1">Estás al día.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pedidosPendientes.map((pedido) => {
              const creador = pedido.usuario_creador as unknown as { nombre: string; apellido: string } | null;
              const sede = pedido.sede as unknown as { nombre: string } | null;
              return (
                <div key={pedido.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{pedido.numero}</p>
                        {pedido.excede_presupuesto && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">Excede</span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate">
                        {creador ? `${creador.nombre} ${creador.apellido}` : '—'}
                        {sede && ` · ${sede.nombre}`}
                        {' · '}{formatTimeAgo(pedido.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-foreground">
                      {pedido.valor_total_cop != null ? formatCOP(pedido.valor_total_cop) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Presupuesto por sedes */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-4">Ejecución Presupuestal por Sede</h2>
        {presupuestos.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">No hay presupuestos configurados para este mes.</p>
        ) : (
          <div className="space-y-4">
            {presupuestos.map((pres, i) => {
              const porcentaje = pres.monto_inicial > 0
                ? Math.round((pres.monto_consumido / pres.monto_inicial) * 100)
                : 0;
              const barColor = porcentaje >= 90 ? 'bg-red-500' : porcentaje >= 70 ? 'bg-amber-500' : 'bg-primary';

              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-muted" />
                      {pres.sede_nombre}
                    </span>
                    <span className="text-muted">{formatCOP(pres.monto_inicial)}</span>
                  </div>
                  <div className="w-full bg-background-light rounded-full h-2.5">
                    <div
                      className={cn('h-2.5 rounded-full transition-all', barColor)}
                      style={{ width: `${Math.min(porcentaje, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted mt-1">
                    <span>Ejecutado: {formatCOP(pres.monto_consumido)} ({porcentaje}%)</span>
                    <span>Disponible: {formatCOP(pres.monto_disponible)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
