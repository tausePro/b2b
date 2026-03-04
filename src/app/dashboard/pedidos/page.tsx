'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, formatDate } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import { ClipboardList, Search, Filter, Loader2, Eye } from 'lucide-react';
import Link from 'next/link';

interface PedidoListItem {
  id: string;
  numero: string;
  estado: string;
  valor_total_cop: number;
  total_items: number;
  fecha_creacion: string;
  empresa: { nombre: string } | null;
  sede: { nombre_sede: string } | null;
}

export default function PedidosPage() {
  const { user, showPrices } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const supabase = createClient();

  useEffect(() => {
    const fetchPedidos = async () => {
      if (!user) return;
      setLoading(true);

      let query = supabase
        .from('pedidos')
        .select(`
          id, numero, estado, valor_total_cop, total_items, fecha_creacion,
          empresa:empresas(nombre),
          sede:sedes(nombre_sede)
        `)
        .order('fecha_creacion', { ascending: false });

      // Comprador solo ve sus pedidos
      if (user.rol === 'comprador') {
        query = query.eq('usuario_creador_id', user.id);
      } else if (user.rol === 'aprobador') {
        query = query.eq('empresa_id', user.empresa_id);
      }

      if (filtroEstado !== 'todos') {
        query = query.eq('estado', filtroEstado);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching pedidos:', error);
      } else {
        setPedidos((data as unknown as PedidoListItem[]) || []);
      }
      setLoading(false);
    };

    fetchPedidos();
  }, [user, filtroEstado, supabase]);

  const pedidosFiltrados = busqueda.trim()
    ? pedidos.filter(
        (p) =>
          p.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.sede?.nombre_sede.toLowerCase().includes(busqueda.toLowerCase())
      )
    : pedidos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {user?.rol === 'comprador' ? 'Mis Pedidos' : 'Pedidos'}
        </h1>
        <p className="text-muted text-sm mt-1">
          Historial y seguimiento de pedidos
        </p>
      </div>

      {/* Búsqueda y filtros */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar por número o sede..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background-light border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-4 h-4 text-muted shrink-0" />
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'borrador', label: 'Borrador' },
              { key: 'en_aprobacion', label: 'En Aprobación' },
              { key: 'aprobado', label: 'Aprobados' },
              { key: 'en_validacion_imprima', label: 'En Validación' },
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

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted mt-2">Cargando pedidos...</p>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-border mx-auto mb-3" />
            <p className="text-sm text-muted">No se encontraron pedidos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Fecha</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Items</th>
                  {showPrices && (
                    <th className="text-right py-3 px-4 font-medium text-muted">Total</th>
                  )}
                  <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((pedido) => (
                  <tr key={pedido.id} className="border-b border-border/50 hover:bg-background-light/30">
                    <td className="py-3 px-4 font-semibold text-foreground">{pedido.numero}</td>
                    <td className="py-3 px-4 text-muted">{pedido.sede?.nombre_sede || '—'}</td>
                    <td className="py-3 px-4 text-muted">{formatDate(pedido.fecha_creacion)}</td>
                    <td className="py-3 px-4 text-right">{pedido.total_items}</td>
                    {showPrices && (
                      <td className="py-3 px-4 text-right font-semibold">{formatCOP(pedido.valor_total_cop)}</td>
                    )}
                    <td className="py-3 px-4 text-center">
                      <StatusBadge estado={pedido.estado} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        href={`/dashboard/pedidos/${pedido.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-background-light hover:bg-border text-sm font-medium text-foreground transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </Link>
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
