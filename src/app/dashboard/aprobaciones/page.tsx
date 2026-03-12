'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, formatDate, getEstadoColor, getEstadoLabel } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  DollarSign,
  CheckSquare,
  Clock,
  Eye,
  Check,
  X,
  Filter,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface PedidoPendiente {
  id: string;
  numero: string;
  estado: string;
  valor_total_cop: number;
  total_items: number;
  comentarios_sede: string | null;
  fecha_creacion: string;
  sede: { nombre_sede: string } | null;
  creador: { nombre: string; apellido: string } | null;
}

export default function AprobacionesPage() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('en_aprobacion');
  const [procesando, setProcesando] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchPedidos();
  }, [filtroEstado]);

  const fetchPedidos = async () => {
    setLoading(true);
    let query = supabase
      .from('pedidos')
      .select(`
        id, numero, estado, valor_total_cop, total_items, comentarios_sede, fecha_creacion,
        sede:sedes(nombre_sede),
        creador:usuarios!pedidos_usuario_creador_id_fkey(nombre, apellido)
      `)
      .eq('empresa_id', user?.empresa_id)
      .order('fecha_creacion', { ascending: false });

    if (filtroEstado !== 'todos') {
      query = query.eq('estado', filtroEstado);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching pedidos:', error);
    } else {
      setPedidos((data as unknown as PedidoPendiente[]) || []);
    }
    setLoading(false);
  };

  const handleAprobar = async (pedidoId: string) => {
    if (!user) return;
    setProcesando(pedidoId);
    try {
      const response = await fetch(`/api/pedidos/${pedidoId}/aprobar`, {
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'No se pudo aprobar el pedido.');
      }

      if (payload.warning) {
        console.warn('[Aprobaciones] Advertencia al registrar trazabilidad:', payload.warning);
      }

      fetchPedidos();
    } catch (error) {
      console.error('Error aprobando pedido y enviando a Odoo:', error);
      alert(error instanceof Error ? error.message : 'No se pudo aprobar el pedido y enviarlo a Odoo.');
    } finally {
      setProcesando(null);
    }
  };

  const handleRechazar = async (pedidoId: string) => {
    if (!user) return;
    setProcesando(pedidoId);

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: 'rechazado' })
      .eq('id', pedidoId);

    if (!error) {
      await supabase.from('logs_trazabilidad').insert({
        pedido_id: pedidoId,
        accion: 'rechazo',
        descripcion: 'Pedido rechazado por gerencia',
        usuario_id: user.id,
        usuario_nombre: `${user.nombre} ${user.apellido}`,
      });
      fetchPedidos();
    }
    setProcesando(null);
  };

  const pendientes = pedidos.filter((p) => p.estado === 'en_aprobacion');
  const valorPendiente = pendientes.reduce((s, p) => s + p.valor_total_cop, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel de Aprobación</h1>
        <p className="text-muted text-sm mt-1">Gestiona las aprobaciones de pedidos de tus sedes</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Valor Total Pendiente"
          value={formatCOP(valorPendiente)}
          subtitle={`${pendientes.length} pedidos por aprobar`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Aprobados Hoy"
          value={String(pedidos.filter((p) => p.estado === 'aprobado').length)}
          subtitle="Pedidos"
          icon={<CheckSquare className="w-5 h-5" />}
        />
        <KpiCard
          title="Tiempo Promedio"
          value="4.2 hrs"
          subtitle="Aprobación"
          icon={<Clock className="w-5 h-5" />}
        />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted" />
        {[
          { key: 'en_aprobacion', label: 'Pendientes' },
          { key: 'aprobado', label: 'Aprobados' },
          { key: 'rechazado', label: 'Rechazados' },
          { key: 'todos', label: 'Todos' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltroEstado(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filtroEstado === f.key
                ? 'bg-primary text-white'
                : 'bg-white text-muted border border-border hover:bg-background-light'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de pedidos */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted mt-2">Cargando pedidos...</p>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted">No hay pedidos con el filtro seleccionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Solicitante</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Fecha</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Items</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Total</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <tr key={pedido.id} className="border-b border-border/50 hover:bg-background-light/30">
                    <td className="py-3 px-4 font-semibold text-foreground">{pedido.numero}</td>
                    <td className="py-3 px-4 text-muted">{pedido.sede?.nombre_sede || '—'}</td>
                    <td className="py-3 px-4 text-muted">
                      {pedido.creador ? `${pedido.creador.nombre} ${pedido.creador.apellido}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-muted">{formatDate(pedido.fecha_creacion)}</td>
                    <td className="py-3 px-4 text-right">{pedido.total_items}</td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCOP(pedido.valor_total_cop)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getEstadoColor(pedido.estado)}`}>
                        {getEstadoLabel(pedido.estado)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/dashboard/pedidos/${pedido.id}`}
                          className="p-1.5 rounded-lg hover:bg-background-light text-muted hover:text-foreground transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {pedido.estado === 'en_aprobacion' && (
                          <>
                            <button
                              onClick={() => handleAprobar(pedido.id)}
                              disabled={procesando === pedido.id}
                              className="p-1.5 rounded-lg hover:bg-success/10 text-muted hover:text-success transition-colors disabled:opacity-50"
                              title="Aprobar"
                            >
                              {procesando === pedido.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleRechazar(pedido.id)}
                              disabled={procesando === pedido.id}
                              className="p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-colors disabled:opacity-50"
                              title="Rechazar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
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
