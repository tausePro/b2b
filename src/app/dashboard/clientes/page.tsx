'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import BrandMark from '@/components/ui/BrandMark';
import Link from 'next/link';
import {
  Building2,
  Users,
  ClipboardList,
  MapPin,
  Search,
  Loader2,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { cn, formatCOP, isPedidoPendienteComercial } from '@/lib/utils';

interface ClienteAsignado {
  id: string;
  nombre: string;
  nit: string | null;
  activa: boolean;
  presupuesto_global_mensual: number | null;
  odoo_partner_id: number;
  created_at: string;
  config?: {
    slug: string | null;
    logo_url: string | null;
    color_primario: string;
  } | null;
  sedes_count: number;
  usuarios_count: number;
  pedidos_total: number;
  pedidos_pendientes: number;
  pedidos_mes: number;
  valor_mes: number;
}

interface PedidoPendienteCliente {
  id: string;
  estado: string;
  odoo_sale_order_id: number | null;
}

const supabase = createClient();

export default function ClientesPage() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<ClienteAsignado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activas' | 'inactivas'>('todos');

  useEffect(() => {
    const fetchClientes = async () => {
      if (!user) return;
      setLoading(true);

      // super_admin y direccion ven todas las empresas; asesor solo las asignadas
      const isGlobalRole = user.rol === 'super_admin' || user.rol === 'direccion';

      let empresaIds: string[] | null = null;

      if (!isGlobalRole) {
        const { data: asignaciones, error: asignError } = await supabase
          .from('asesor_empresas')
          .select('empresa_id')
          .eq('usuario_id', user.id)
          .eq('activo', true);

        if (asignError || !asignaciones?.length) {
          console.error('Error o sin asignaciones:', asignError);
          setClientes([]);
          setLoading(false);
          return;
        }

        empresaIds = asignaciones.map((a) => a.empresa_id);
      }

      // Obtener datos de las empresas
      let empresasQuery = supabase
        .from('empresas')
        .select('id, nombre, nit, activa, presupuesto_global_mensual, odoo_partner_id, created_at')
        .order('nombre');

      if (empresaIds) {
        empresasQuery = empresasQuery.in('id', empresaIds);
      }

      const { data: empresas, error: empError } = await empresasQuery;

      if (empError || !empresas) {
        console.error('Error fetching empresas:', empError);
        setClientes([]);
        setLoading(false);
        return;
      }

      // Obtener configs, sedes, usuarios y pedidos en paralelo
      const now = new Date();
      const mesActual = now.getMonth() + 1;
      const anioActual = now.getFullYear();
      const inicioMes = `${anioActual}-${String(mesActual).padStart(2, '0')}-01T00:00:00`;

      const clientesEnriquecidos: ClienteAsignado[] = await Promise.all(
        empresas.map(async (emp) => {
          const [configRes, sedesRes, usuariosRes, pedidosTotalRes, pedidosPendRes, pedidosMesRes] =
            await Promise.allSettled([
              supabase
                .from('empresa_configs')
                .select('slug, logo_url, color_primario')
                .eq('empresa_id', emp.id)
                .single(),
              supabase
                .from('sedes')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', emp.id),
              supabase
                .from('usuarios')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', emp.id),
              supabase
                .from('pedidos')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', emp.id),
              supabase
                .from('pedidos')
                .select('id, estado')
                .eq('empresa_id', emp.id)
                .in('estado', ['borrador', 'en_aprobacion', 'aprobado', 'en_validacion_imprima']),
              supabase
                .from('pedidos')
                .select('valor_total_cop')
                .eq('empresa_id', emp.id)
                .gte('fecha_creacion', inicioMes),
            ]);

          const config =
            configRes.status === 'fulfilled' && configRes.value.data
              ? (configRes.value.data as ClienteAsignado['config'])
              : null;

          const sedes_count =
            sedesRes.status === 'fulfilled' ? (sedesRes.value.count ?? 0) : 0;
          const usuarios_count =
            usuariosRes.status === 'fulfilled' ? (usuariosRes.value.count ?? 0) : 0;
          const pedidos_total =
            pedidosTotalRes.status === 'fulfilled' ? (pedidosTotalRes.value.count ?? 0) : 0;
          const pedidos_pendientes =
            pedidosPendRes.status === 'fulfilled' && pedidosPendRes.value.data
              ? (pedidosPendRes.value.data as unknown as PedidoPendienteCliente[]).filter((pedido) =>
                  isPedidoPendienteComercial(pedido.estado)
                ).length
              : 0;

          let pedidos_mes = 0;
          let valor_mes = 0;
          if (pedidosMesRes.status === 'fulfilled' && pedidosMesRes.value.data) {
            pedidos_mes = pedidosMesRes.value.data.length;
            valor_mes = pedidosMesRes.value.data.reduce(
              (sum: number, p: { valor_total_cop: number | null }) => sum + (p.valor_total_cop || 0),
              0
            );
          }

          return {
            ...emp,
            config,
            sedes_count,
            usuarios_count,
            pedidos_total,
            pedidos_pendientes,
            pedidos_mes,
            valor_mes,
          };
        })
      );

      setClientes(clientesEnriquecidos);
      setLoading(false);
    };

    fetchClientes();
  }, [user]);

  const clientesFiltrados = clientes.filter((c) => {
    const matchBusqueda =
      !busqueda.trim() ||
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.nit?.toLowerCase().includes(busqueda.toLowerCase());

    const matchEstado =
      filtroEstado === 'todos' ||
      (filtroEstado === 'activas' && c.activa) ||
      (filtroEstado === 'inactivas' && !c.activa);

    return matchBusqueda && matchEstado;
  });

  // KPIs globales
  const totalClientes = clientes.length;
  const clientesActivos = clientes.filter((c) => c.activa).length;
  const totalPedidosMes = clientes.reduce((s, c) => s + c.pedidos_mes, 0);
  const totalValorMes = clientes.reduce((s, c) => s + c.valor_mes, 0);
  const totalPendientes = clientes.reduce((s, c) => s + c.pedidos_pendientes, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mis Clientes</h1>
        <p className="text-muted text-sm mt-1">
          {totalClientes} empresa{totalClientes !== 1 ? 's' : ''} asignada{totalClientes !== 1 ? 's' : ''} — {user?.nombre} {user?.apellido}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Clientes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{clientesActivos}<span className="text-sm font-normal text-muted">/{totalClientes}</span></p>
          <p className="text-xs text-muted mt-0.5">activos</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <ClipboardList className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Pedidos Mes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalPedidosMes}</p>
          <p className="text-xs text-muted mt-0.5">este mes</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-green-100 rounded-lg">
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Valor Mes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCOP(totalValorMes)}</p>
          <p className="text-xs text-muted mt-0.5">ventas del mes</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn('p-1.5 rounded-lg', totalPendientes > 0 ? 'bg-amber-100' : 'bg-slate-100')}>
              <AlertCircle className={cn('w-4 h-4', totalPendientes > 0 ? 'text-amber-600' : 'text-slate-400')} />
            </div>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Pendientes</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalPendientes}</p>
          <p className="text-xs text-muted mt-0.5">requieren acción</p>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Buscar por nombre o NIT..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>
        <div className="flex gap-2">
          {(['todos', 'activas', 'inactivas'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroEstado(f)}
              className={cn(
                'px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                filtroEstado === f
                  ? 'bg-primary text-white'
                  : 'bg-white border border-border text-muted hover:text-foreground'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de clientes */}
      {clientesFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Building2 className="w-10 h-10 text-border mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {busqueda ? 'Sin resultados' : 'Sin clientes asignados'}
          </h2>
          <p className="text-sm text-muted">
            {busqueda
              ? 'Intenta con otro término de búsqueda.'
              : 'Aún no tienes empresas asignadas. Contacta al administrador.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {clientesFiltrados.map((cliente) => (
            <Link
              key={cliente.id}
              href={`/dashboard/clientes/${cliente.id}`}
              className="bg-white rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all group"
              style={{ borderTop: `3px solid ${cliente.config?.color_primario || '#9CBB06'}` }}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrandMark
                    name={cliente.nombre}
                    logoUrl={cliente.config?.logo_url}
                    color={cliente.config?.color_primario}
                    className="h-10 w-10 rounded-lg"
                    imageClassName="p-1"
                    initialsClassName="text-sm"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {cliente.nombre}
                      </h3>
                      {cliente.config?.slug && (
                        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-primary">
                          {cliente.config.slug}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{cliente.nit || 'Sin NIT'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn('h-2.5 w-2.5 rounded-full', cliente.activa ? 'bg-green-500' : 'bg-slate-300')} />
                  <span className="text-xs font-medium text-muted">
                    {cliente.activa ? 'Activa' : 'Inactiva'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors ml-2" />
                </div>
              </div>

              {/* Métricas */}
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Sedes
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{cliente.sedes_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <Users className="w-3 h-3" /> Usuarios
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{cliente.usuarios_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" /> Pedidos mes
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{cliente.pedidos_mes}</p>
                </div>
                <div>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Valor mes
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{formatCOP(cliente.valor_mes)}</p>
                </div>
              </div>

              {/* Footer con alertas */}
              {(cliente.pedidos_pendientes > 0 || cliente.presupuesto_global_mensual) && (
                <div className="px-5 py-3 border-t border-border bg-slate-50/50 flex items-center gap-4 text-xs">
                  {cliente.pedidos_pendientes > 0 && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <Clock className="w-3 h-3" />
                      {cliente.pedidos_pendientes} pendiente{cliente.pedidos_pendientes !== 1 ? 's' : ''}
                    </span>
                  )}
                  {cliente.pedidos_pendientes === 0 && cliente.pedidos_total > 0 && (
                    <span className="flex items-center gap-1 text-green-600 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Al día
                    </span>
                  )}
                  {cliente.presupuesto_global_mensual && (
                    <span className="text-muted ml-auto">
                      Presupuesto: {formatCOP(cliente.presupuesto_global_mensual)}/mes
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
