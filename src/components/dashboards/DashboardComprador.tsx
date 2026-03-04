'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ShoppingBag, ClipboardList, Clock, ArrowRight, Loader2 } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';

interface PedidoReciente {
  id: string;
  numero: string;
  estado: string;
  valor_total_cop: number | null;
  created_at: string;
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

export default function DashboardComprador() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pedidosActivos, setPedidosActivos] = useState(0);
  const [ultimoPedido, setUltimoPedido] = useState<PedidoReciente | null>(null);
  const [pedidosRecientes, setPedidosRecientes] = useState<PedidoReciente[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);

      const [activosRes, recientesRes] = await Promise.allSettled([
        supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .eq('usuario_creador_id', user.id)
          .in('estado', ['borrador', 'en_aprobacion', 'aprobado', 'en_validacion_imprima']),
        supabase
          .from('pedidos')
          .select('id, numero, estado, valor_total_cop, created_at')
          .eq('usuario_creador_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (activosRes.status === 'fulfilled') {
        setPedidosActivos(activosRes.value.count ?? 0);
      }

      if (recientesRes.status === 'fulfilled' && recientesRes.value.data) {
        const pedidos = recientesRes.value.data as PedidoReciente[];
        setPedidosRecientes(pedidos);
        if (pedidos.length > 0) setUltimoPedido(pedidos[0]);
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    return `Hace ${days} días`;
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
          Bienvenido, {user?.nombre}
        </h1>
        <p className="text-muted text-sm mt-1">
          Explora el catálogo y realiza tus pedidos corporativos
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="Pedidos Activos"
          value={String(pedidosActivos)}
          subtitle="En proceso"
          icon={<ClipboardList className="w-5 h-5" />}
        />
        <KpiCard
          title="Productos Disponibles"
          value="—"
          subtitle="Pendiente integración Odoo"
          icon={<ShoppingBag className="w-5 h-5" />}
        />
        <KpiCard
          title="Último Pedido"
          value={ultimoPedido ? formatTimeAgo(ultimoPedido.created_at) : 'Ninguno'}
          subtitle={ultimoPedido?.numero || 'Sin pedidos aún'}
          icon={<Clock className="w-5 h-5" />}
        />
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/dashboard/catalogo"
          className="bg-white rounded-xl border border-border p-6 hover:border-primary/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Explorar Catálogo</h3>
              <p className="text-sm text-muted mt-1">
                Busca y agrega productos a tu pedido
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
          </div>
        </Link>
        <Link
          href="/dashboard/pedidos"
          className="bg-white rounded-xl border border-border p-6 hover:border-primary/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Mis Pedidos</h3>
              <p className="text-sm text-muted mt-1">
                Revisa el estado de tus pedidos
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
          </div>
        </Link>
      </div>

      {/* Pedidos recientes */}
      <div className="bg-white rounded-xl border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Pedidos Recientes</h2>
          <Link href="/dashboard/pedidos" className="text-sm text-primary hover:text-primary-dark font-medium">
            Ver todos
          </Link>
        </div>
        {pedidosRecientes.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="w-8 h-8 text-border mx-auto mb-2" />
            <p className="text-sm text-muted">No tienes pedidos aún.</p>
            <p className="text-xs text-muted mt-1">Explora el catálogo para hacer tu primer pedido.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pedidosRecientes.map((pedido) => {
              const estado = ESTADO_LABELS[pedido.estado] || { label: pedido.estado, color: 'bg-slate-100 text-slate-600' };
              return (
                <div key={pedido.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{pedido.numero}</p>
                    <p className="text-xs text-muted">{formatTimeAgo(pedido.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', estado.color)}>
                      {estado.label}
                    </span>
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
