'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP } from '@/lib/utils';
import { cn } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import Link from 'next/link';
import {
  Building2,
  ClipboardList,
  DollarSign,
  AlertCircle,
  ArrowRight,
  Loader2,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';

interface PedidoReciente {
  id: string;
  numero: string;
  estado: string;
  valor_total_cop: number | null;
  created_at: string;
  empresa: { nombre: string } | null;
  sede: { nombre: string } | null;
}

interface ClienteResumen {
  id: string;
  nombre: string;
  activa: boolean;
  pedidos_pendientes: number;
  color_primario: string;
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

export default function DashboardAsesor() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalClientes, setTotalClientes] = useState(0);
  const [pedidosMes, setPedidosMes] = useState(0);
  const [valorMes, setValorMes] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  const [pedidosRecientes, setPedidosRecientes] = useState<PedidoReciente[]>([]);
  const [clientesResumen, setClientesResumen] = useState<ClienteResumen[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);

      // 1. Empresas asignadas
      const { data: asignaciones } = await supabase
        .from('asesor_empresas')
        .select('empresa_id')
        .eq('usuario_id', user.id)
        .eq('activo', true);

      const empresaIds = asignaciones?.map((a) => a.empresa_id) || [];
      setTotalClientes(empresaIds.length);

      if (empresaIds.length === 0) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;

      // 2. Queries en paralelo
      const [pedidosMesRes, pendientesRes, recientesRes, empresasRes] = await Promise.allSettled([
        supabase
          .from('pedidos')
          .select('valor_total_cop')
          .in('empresa_id', empresaIds)
          .gte('created_at', inicioMes),
        supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .in('empresa_id', empresaIds)
          .in('estado', ['borrador', 'en_aprobacion', 'aprobado', 'en_validacion_imprima']),
        supabase
          .from('pedidos')
          .select('id, numero, estado, valor_total_cop, created_at, empresa:empresas(nombre), sede:sedes(nombre)')
          .in('empresa_id', empresaIds)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('empresas')
          .select('id, nombre, activa')
          .in('id', empresaIds),
      ]);

      // Pedidos del mes
      if (pedidosMesRes.status === 'fulfilled' && pedidosMesRes.value.data) {
        setPedidosMes(pedidosMesRes.value.data.length);
        setValorMes(
          pedidosMesRes.value.data.reduce(
            (s: number, p: { valor_total_cop: number | null }) => s + (p.valor_total_cop || 0),
            0
          )
        );
      }

      // Pendientes
      if (pendientesRes.status === 'fulfilled') {
        setPendientes(pendientesRes.value.count ?? 0);
      }

      // Pedidos recientes
      if (recientesRes.status === 'fulfilled' && recientesRes.value.data) {
        setPedidosRecientes(recientesRes.value.data as unknown as PedidoReciente[]);
      }

      // Clientes con pedidos pendientes
      if (empresasRes.status === 'fulfilled' && empresasRes.value.data) {
        const resumen: ClienteResumen[] = await Promise.all(
          empresasRes.value.data.map(async (emp) => {
            const { count } = await supabase
              .from('pedidos')
              .select('id', { count: 'exact', head: true })
              .eq('empresa_id', emp.id)
              .in('estado', ['borrador', 'en_aprobacion', 'aprobado', 'en_validacion_imprima']);

            const { data: cfg } = await supabase
              .from('empresa_configs')
              .select('color_primario')
              .eq('empresa_id', emp.id)
              .single();

            return {
              id: emp.id,
              nombre: emp.nombre,
              activa: emp.activa,
              pedidos_pendientes: count ?? 0,
              color_primario: cfg?.color_primario || '#9CBB06',
            };
          })
        );
        setClientesResumen(resumen.sort((a, b) => b.pedidos_pendientes - a.pedidos_pendientes));
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

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
          Dashboard Asesor
        </h1>
        <p className="text-muted text-sm mt-1">
          Resumen de tu actividad comercial — {user?.nombre} {user?.apellido}
        </p>
      </div>

      {/* KPIs */}
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Resumen del Mes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Clientes Asignados"
            value={String(totalClientes)}
            subtitle="Empresas activas"
            icon={<Building2 className="w-5 h-5" />}
          />
          <KpiCard
            title="Pedidos del Mes"
            value={String(pedidosMes)}
            subtitle="Este mes"
            icon={<ClipboardList className="w-5 h-5" />}
          />
          <KpiCard
            title="Valor Total Ventas"
            value={formatCOP(valorMes)}
            subtitle="Mes actual"
            icon={<DollarSign className="w-5 h-5" />}
          />
          <KpiCard
            title="Pendientes"
            value={String(pendientes)}
            subtitle="Requieren acción"
            icon={<AlertCircle className="w-5 h-5" />}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pedidos recientes */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Pedidos Recientes</h2>
            <Link href="/dashboard/gestion-pedidos" className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1">
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {pedidosRecientes.length === 0 ? (
            <div className="p-8 text-center">
              <ClipboardList className="w-8 h-8 text-border mx-auto mb-2" />
              <p className="text-sm text-muted">No hay pedidos aún.</p>
              <p className="text-xs text-muted mt-1">Los pedidos de tus clientes aparecerán aquí.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pedidosRecientes.map((pedido) => {
                const estado = ESTADO_LABELS[pedido.estado] || { label: pedido.estado, color: 'bg-slate-100 text-slate-600' };
                return (
                  <div key={pedido.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{pedido.numero}</p>
                        <p className="text-xs text-muted truncate">
                          {(pedido.empresa as unknown as { nombre: string })?.nombre || '—'}
                          {pedido.sede && ` · ${(pedido.sede as unknown as { nombre: string }).nombre}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', estado.color)}>
                        {estado.label}
                      </span>
                      {pedido.valor_total_cop != null && (
                        <span className="text-sm font-semibold text-foreground w-28 text-right">
                          {formatCOP(pedido.valor_total_cop)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Clientes sidebar */}
        <div className="bg-white rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Mis Clientes</h2>
            <Link href="/dashboard/clientes" className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1">
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {clientesResumen.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-8 h-8 text-border mx-auto mb-2" />
              <p className="text-sm text-muted">Sin clientes asignados.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {clientesResumen.map((cliente) => (
                <Link
                  key={cliente.id}
                  href={`/dashboard/clientes/${cliente.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: cliente.color_primario }}
                    >
                      {cliente.nombre.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{cliente.nombre}</p>
                      <p className="text-xs text-muted">
                        {cliente.activa ? 'Activa' : 'Inactiva'}
                      </p>
                    </div>
                  </div>
                  {cliente.pedidos_pendientes > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                      <Clock className="w-3 h-3" />
                      {cliente.pedidos_pendientes}
                    </span>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
