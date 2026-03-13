'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, formatDate, getEstadoColor, getEstadoLabel } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Check,
  Filter,
  Loader2,
  Search,
} from 'lucide-react';
import Link from 'next/link';

interface PedidoAsesor {
  id: string;
  numero: string;
  estado: string;
  odoo_sale_order_id: number | null;
  valor_total_cop: number;
  total_items: number;
  comentarios_sede: string | null;
  fecha_creacion: string;
  empresa: { nombre: string } | null;
  sede: { nombre_sede: string } | null;
  creador: { nombre: string; apellido: string } | null;
}

interface PedidoResumenGestion {
  id: string;
  estado: string;
  odoo_sale_order_id: number | null;
  fecha_creacion: string;
  fecha_validacion: string | null;
}

export default function GestionPedidosPage() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoAsesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('aprobado');
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [porValidar, setPorValidar] = useState(0);
  const [validadosHoy, setValidadosHoy] = useState(0);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [tiempoPromedioHoras, setTiempoPromedioHoras] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    fetchPedidos();
  }, [filtroEstado, user]);

  const fetchPedidos = async () => {
    if (!user) return;

    setLoading(true);
    let query = supabase
      .from('pedidos')
      .select(`
        id, numero, estado, odoo_sale_order_id, valor_total_cop, total_items, comentarios_sede, fecha_creacion,
        empresa:empresas(nombre),
        sede:sedes(nombre_sede),
        creador:usuarios!pedidos_usuario_creador_id_fkey(nombre, apellido)
      `)
      .order('fecha_creacion', { ascending: false });

    if (filtroEstado === 'aprobado') {
      query = query.eq('estado', 'aprobado').is('odoo_sale_order_id', null);
    } else if (filtroEstado === 'procesado_odoo') {
      query = query.not('odoo_sale_order_id', 'is', null);
    } else if (filtroEstado !== 'todos') {
      query = query.eq('estado', filtroEstado);
    }

    const [pedidosRes, resumenRes] = await Promise.all([
      query,
      supabase
        .from('pedidos')
        .select('id, estado, odoo_sale_order_id, fecha_creacion, fecha_validacion'),
    ]);

    const { data, error } = pedidosRes;
    if (error) {
      console.error('Error fetching pedidos:', error);
      setPedidos([]);
    } else {
      setPedidos((data as unknown as PedidoAsesor[]) || []);
    }

    if (resumenRes.error) {
      console.error('Error fetching resumen de gestión:', resumenRes.error);
      setPorValidar(0);
      setValidadosHoy(0);
      setTotalPedidos(0);
      setTiempoPromedioHoras(null);
    } else {
      const resumenPedidos = (resumenRes.data as PedidoResumenGestion[] | null) ?? [];
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);

      setPorValidar(
        resumenPedidos.filter((pedido) => pedido.estado === 'aprobado' && !pedido.odoo_sale_order_id).length
      );
      setValidadosHoy(
        resumenPedidos.filter((pedido) => {
          if (!pedido.fecha_validacion) return false;
          const fechaValidacion = new Date(pedido.fecha_validacion);
          return !Number.isNaN(fechaValidacion.getTime()) && fechaValidacion >= inicioHoy;
        }).length
      );
      setTotalPedidos(resumenPedidos.length);

      const duracionesHoras = resumenPedidos.flatMap((pedido) => {
        if (!pedido.fecha_validacion) return [];

        const fechaCreacion = new Date(pedido.fecha_creacion).getTime();
        const fechaValidacion = new Date(pedido.fecha_validacion).getTime();

        if (
          Number.isNaN(fechaCreacion) ||
          Number.isNaN(fechaValidacion) ||
          fechaValidacion < fechaCreacion
        ) {
          return [];
        }

        return [(fechaValidacion - fechaCreacion) / (1000 * 60 * 60)];
      });

      setTiempoPromedioHoras(
        duracionesHoras.length > 0
          ? duracionesHoras.reduce((acumulado, duracion) => acumulado + duracion, 0) / duracionesHoras.length
          : null
      );
    }

    setLoading(false);
  };

  const handleValidar = async (pedidoId: string) => {
    if (!user) return;
    setProcesando(pedidoId);

    const { error } = await supabase
      .from('pedidos')
      .update({
        estado: 'en_validacion_imprima',
        validado_por: user.id,
        fecha_validacion: new Date().toISOString(),
      })
      .eq('id', pedidoId);

    if (!error) {
      await supabase.from('logs_trazabilidad').insert({
        pedido_id: pedidoId,
        accion: 'validacion',
        descripcion: 'Pedido en validación por asesor comercial Imprima.',
        usuario_id: user.id,
        usuario_nombre: `${user.nombre} ${user.apellido}`,
      });
      fetchPedidos();
    }
    setProcesando(null);
  };

  const tiempoPromedioLabel = useMemo(() => {
    if (tiempoPromedioHoras == null) return '—';

    if (tiempoPromedioHoras < 1) {
      return `${Math.max(1, Math.round(tiempoPromedioHoras * 60))} min`;
    }

    if (tiempoPromedioHoras < 24) {
      const precision = tiempoPromedioHoras >= 10 ? 0 : 1;
      return `${tiempoPromedioHoras.toFixed(precision)} hrs`;
    }

    const tiempoPromedioDias = tiempoPromedioHoras / 24;
    const precision = tiempoPromedioDias >= 10 ? 0 : 1;
    return `${tiempoPromedioDias.toFixed(precision)} días`;
  }, [tiempoPromedioHoras]);

  const pedidosFiltrados = busqueda.trim()
    ? pedidos.filter(
        (p) =>
          p.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
          (p.empresa?.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
          (p.sede?.nombre_sede || '').toLowerCase().includes(busqueda.toLowerCase())
      )
    : pedidos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestión de Pedidos</h1>
        <p className="text-muted text-sm mt-1">Revisa pedidos aprobados y su estado de envío a Odoo</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Por Validar"
          value={String(porValidar)}
          subtitle="Pedidos aprobados"
          icon={<AlertCircle className="w-5 h-5" />}
        />
        <KpiCard
          title="Validados Hoy"
          value={String(validadosHoy)}
          subtitle="Listos para Odoo"
          icon={<CheckCircle className="w-5 h-5" />}
        />
        <KpiCard
          title="Total Pedidos"
          value={String(totalPedidos)}
          subtitle="En gestión"
          icon={<Package className="w-5 h-5" />}
        />
        <KpiCard
          title="Tiempo Promedio"
          value={tiempoPromedioLabel}
          subtitle="Validación"
          icon={<Clock className="w-5 h-5" />}
        />
      </div>

      {/* Filtros y búsqueda */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar por número, empresa o sede..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background-light border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted shrink-0" />
            {[
              { key: 'aprobado', label: 'Por Validar' },
              { key: 'en_validacion_imprima', label: 'En Validación' },
              { key: 'procesado_odoo', label: 'En Odoo' },
              { key: 'todos', label: 'Todos' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltroEstado(f.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  filtroEstado === f.key
                    ? 'bg-primary text-white'
                    : 'bg-background-light text-muted hover:bg-border'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de pedidos */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted mt-2">Cargando pedidos...</p>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted">No hay pedidos con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Empresa</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Fecha</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Total</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((pedido) => (
                  <tr key={pedido.id} className="border-b border-border/50 hover:bg-background-light/30">
                    <td className="py-3 px-4 font-semibold text-foreground">{pedido.numero}</td>
                    <td className="py-3 px-4 text-muted">{pedido.empresa?.nombre || '—'}</td>
                    <td className="py-3 px-4 text-muted">{pedido.sede?.nombre_sede || '—'}</td>
                    <td className="py-3 px-4 text-muted">{formatDate(pedido.fecha_creacion)}</td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCOP(pedido.valor_total_cop)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getEstadoColor(pedido.odoo_sale_order_id ? 'procesado_odoo' : pedido.estado)}`}>
                        {getEstadoLabel(pedido.odoo_sale_order_id ? 'procesado_odoo' : pedido.estado)}
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
                        {pedido.estado === 'aprobado' && !pedido.odoo_sale_order_id && (
                          <button
                            onClick={() => handleValidar(pedido.id)}
                            disabled={procesando === pedido.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
                            title="Validar pedido"
                          >
                            {procesando === pedido.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Validar
                          </button>
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
