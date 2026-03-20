'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import BrandMark from '@/components/ui/BrandMark';
import { formatCOP, formatDate } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  Clock,
  DollarSign,
  Loader2,
  MapPin,
  Phone,
  User,
  Users,
  Eye,
  BadgeCheck,
  Package,
  Search,
} from 'lucide-react';

interface ClienteDetalle {
  id: string;
  nombre: string;
  nit: string | null;
  activa: boolean;
  presupuesto_global_mensual: number | null;
  odoo_partner_id: number | null;
  odoo_comercial_id: number | null;
  odoo_comercial_nombre: string | null;
  created_at: string;
}

interface EmpresaConfigDetalle {
  slug: string | null;
  logo_url: string | null;
  color_primario: string | null;
  odoo_partner_id: number | null;
  configuracion_extra: Record<string, unknown> | null;
}

interface SedeCliente {
  id: string;
  nombre_sede: string;
  direccion: string | null;
  ciudad: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
}

interface UsuarioCliente {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  activo: boolean;
}

interface PedidoCliente {
  id: string;
  numero: string;
  estado: string;
  odoo_sale_order_id: number | null;
  valor_total_cop: number | null;
  fecha_creacion: string;
  sede: { nombre_sede: string } | null;
}

interface ProductoOdooCliente {
  id: number;
  name: string;
  list_price: number;
  uom_name: string;
  categ_id: [number, string] | false;
  image_128: string | false;
  default_code: string | false;
}

const supabase = createClient();

export default function ClienteDetallePage() {
  const { user, showPrices } = useAuth();
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [config, setConfig] = useState<EmpresaConfigDetalle | null>(null);
  const [sedes, setSedes] = useState<SedeCliente[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioCliente[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [pedidosTotal, setPedidosTotal] = useState(0);
  const [pedidosPendientes, setPedidosPendientes] = useState(0);
  const [pedidosProcesados, setPedidosProcesados] = useState(0);
  const [valorMes, setValorMes] = useState(0);
  const [productosAutorizadosIds, setProductosAutorizadosIds] = useState<Set<number>>(new Set());
  const [productosOdoo, setProductosOdoo] = useState<ProductoOdooCliente[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');

  useEffect(() => {
    const fetchClienteDetalle = async () => {
      if (!user) return;

      setLoading(true);
      setForbidden(false);

      // super_admin y direccion tienen acceso global, no necesitan asignación
      const isGlobalRole = user.rol === 'super_admin' || user.rol === 'direccion';

      if (!isGlobalRole) {
        const { data: asignacion, error: asignacionError } = await supabase
          .from('asesor_empresas')
          .select('empresa_id')
          .eq('usuario_id', user.id)
          .eq('empresa_id', clienteId)
          .eq('activo', true)
          .maybeSingle();

        if (asignacionError || !asignacion) {
          setForbidden(true);
          setCliente(null);
          setLoading(false);
          return;
        }
      }

      const now = new Date();
      const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;

      const [
        clienteRes,
        configRes,
        sedesRes,
        usuariosRes,
        pedidosRes,
        pedidosTotalRes,
        pedidosPendientesRes,
        pedidosProcesadosRes,
        pedidosMesRes,
        productosAuthRes,
      ] = await Promise.all([
        supabase
          .from('empresas')
          .select('id, nombre, nit, activa, presupuesto_global_mensual, odoo_partner_id, odoo_comercial_id, odoo_comercial_nombre, created_at')
          .eq('id', clienteId)
          .single(),
        supabase
          .from('empresa_configs')
          .select('slug, logo_url, color_primario, odoo_partner_id, configuracion_extra')
          .eq('empresa_id', clienteId)
          .maybeSingle(),
        supabase
          .from('sedes')
          .select('id, nombre_sede, direccion, ciudad, contacto_nombre, contacto_telefono')
          .eq('empresa_id', clienteId)
          .order('nombre_sede'),
        supabase
          .from('usuarios')
          .select('id, nombre, apellido, email, rol, activo')
          .eq('empresa_id', clienteId)
          .order('nombre'),
        supabase
          .from('pedidos')
          .select('id, numero, estado, odoo_sale_order_id, valor_total_cop, fecha_creacion, sede:sedes(nombre_sede)')
          .eq('empresa_id', clienteId)
          .order('fecha_creacion', { ascending: false })
          .limit(8),
        supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', clienteId),
        supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', clienteId)
          .in('estado', ['borrador', 'en_aprobacion', 'aprobado', 'en_validacion_imprima']),
        supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', clienteId)
          .eq('estado', 'procesado_odoo'),
        supabase
          .from('pedidos')
          .select('valor_total_cop')
          .eq('empresa_id', clienteId)
          .gte('fecha_creacion', inicioMes),
        supabase
          .from('productos_autorizados')
          .select('odoo_product_id')
          .eq('empresa_id', clienteId)
          .eq('activo', true),
      ]);

      if (clienteRes.error || !clienteRes.data) {
        setCliente(null);
        setLoading(false);
        return;
      }

      setCliente(clienteRes.data as ClienteDetalle);
      setConfig((configRes.data as EmpresaConfigDetalle | null) ?? null);
      setSedes((sedesRes.data as SedeCliente[]) ?? []);
      setUsuarios((usuariosRes.data as UsuarioCliente[]) ?? []);

      const pedidosNormalizados: PedidoCliente[] = ((pedidosRes.data as Array<Record<string, unknown>>) ?? []).map((item) => {
        const sedeValue = item.sede as Array<{ nombre_sede: string }> | { nombre_sede: string } | null;
        const sedeNormalizada = Array.isArray(sedeValue) ? (sedeValue[0] ?? null) : sedeValue;

        return {
          id: String(item.id),
          numero: String(item.numero),
          estado: String(item.estado),
          odoo_sale_order_id: item.odoo_sale_order_id ? Number(item.odoo_sale_order_id) : null,
          valor_total_cop: item.valor_total_cop == null ? null : Number(item.valor_total_cop),
          fecha_creacion: String(item.fecha_creacion),
          sede: sedeNormalizada ? { nombre_sede: sedeNormalizada.nombre_sede } : null,
        };
      });

      setPedidos(pedidosNormalizados);
      setPedidosTotal(pedidosTotalRes.count ?? 0);
      setPedidosPendientes(pedidosPendientesRes.count ?? 0);
      setPedidosProcesados(pedidosProcesadosRes.count ?? 0);
      setValorMes(
        ((pedidosMesRes.data as Array<{ valor_total_cop: number | null }> | null) ?? []).reduce(
          (sum, pedido) => sum + (pedido.valor_total_cop || 0),
          0
        )
      );

      if (productosAuthRes.data) {
        const ids = (productosAuthRes.data as Array<{ odoo_product_id: number }>).map(p => p.odoo_product_id);
        setProductosAutorizadosIds(new Set(ids));
      }

      setLoading(false);
    };

    fetchClienteDetalle();
  }, [clienteId, user]);

  useEffect(() => {
    const partnerDesdeConfig = config?.odoo_partner_id;
    const partnerId = (partnerDesdeConfig && partnerDesdeConfig > 0) ? partnerDesdeConfig : cliente?.odoo_partner_id;
    if (!partnerId || !cliente) return;

    const fetchProductos = async () => {
      setLoadingProductos(true);
      try {
        const res = await fetch(`/api/odoo/productos?partner_id=${partnerId}&limit=500&include_tag_names=true`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const todos = (data.productos || []) as ProductoOdooCliente[];

        if (productosAutorizadosIds.size > 0) {
          setProductosOdoo(todos.filter(p => productosAutorizadosIds.has(p.id)));
        } else {
          setProductosOdoo(todos);
        }
      } catch {
        setProductosOdoo([]);
      } finally {
        setLoadingProductos(false);
      }
    };

    void fetchProductos();
  }, [cliente, config?.odoo_partner_id, productosAutorizadosIds]);

  const productosFiltrados = useMemo(() => {
    if (!busquedaProducto.trim()) return productosOdoo;
    const term = busquedaProducto.toLowerCase();
    return productosOdoo.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (typeof p.default_code === 'string' && p.default_code.toLowerCase().includes(term))
    );
  }, [productosOdoo, busquedaProducto]);

  const usuariosActivos = useMemo(() => usuarios.filter((usuario) => usuario.activo).length, [usuarios]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push('/dashboard/clientes')}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a clientes
        </button>

        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 max-w-xl">
          <h1 className="text-lg font-semibold text-danger">Acceso no permitido</h1>
          <p className="text-sm text-muted mt-2">
            Este cliente no está asignado a tu cartera comercial o ya no tienes acceso activo.
          </p>
        </div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push('/dashboard/clientes')}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a clientes
        </button>

        <div className="rounded-xl border border-border bg-white p-6 max-w-xl">
          <h1 className="text-lg font-semibold text-foreground">Cliente no encontrado</h1>
          <p className="text-sm text-muted mt-2">No pude cargar la información de esta empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl border border-border border-t-4 bg-white p-5 shadow-sm"
        style={{ borderTopColor: config?.color_primario || '#9CBB06' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.push('/dashboard/clientes')}
              className="p-2 rounded-lg hover:bg-background-light border border-border transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted" />
            </button>
            <div className="flex items-start gap-3">
              <BrandMark
                name={cliente.nombre}
                logoUrl={config?.logo_url}
                color={config?.color_primario}
                className="h-12 w-12 rounded-xl border border-border bg-white p-1"
                imageClassName="p-1"
                initialsClassName="text-base"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-foreground">{cliente.nombre}</h1>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cliente.activa ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {cliente.activa ? 'Activa' : 'Inactiva'}
                  </span>
                  {config?.slug && (
                    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary">
                      {config.slug}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted mt-1">
                  NIT: {cliente.nit || 'Sin NIT'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/clientes"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background-light"
            >
              <Building2 className="w-4 h-4" />
              Ver cartera
            </Link>
            <Link
              href="/dashboard/gestion-pedidos"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              style={{ backgroundColor: config?.color_primario || '#9CBB06' }}
            >
              <ClipboardList className="w-4 h-4" />
              Gestionar pedidos
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Pedidos pendientes"
          value={String(pedidosPendientes)}
          subtitle="Requieren seguimiento"
          icon={<Clock className="w-5 h-5" />}
        />
        <KpiCard
          title="Procesados Odoo"
          value={String(pedidosProcesados)}
          subtitle="Ya sincronizados"
          icon={<BadgeCheck className="w-5 h-5" />}
        />
        <KpiCard
          title="Usuarios activos"
          value={String(usuariosActivos)}
          subtitle={`${usuarios.length} usuario(s) totales`}
          icon={<Users className="w-5 h-5" />}
        />
        <KpiCard
          title="Valor del mes"
          value={showPrices ? formatCOP(valorMes) : 'Oculto por rol'}
          subtitle={`${pedidosTotal} pedido(s) históricos`}
          icon={<DollarSign className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">Últimos pedidos</h2>
            {pedidos.length === 0 ? (
              <p className="text-sm text-muted">Esta empresa todavía no registra pedidos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background-light/50">
                      <th className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                      <th className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                      <th className="text-left py-3 px-4 font-medium text-muted">Fecha</th>
                      {showPrices && <th className="text-right py-3 px-4 font-medium text-muted">Subtotal</th>}
                      <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                      <th className="text-center py-3 px-4 font-medium text-muted">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((pedido) => (
                      <tr key={pedido.id} className="border-b border-border/50 hover:bg-background-light/30">
                        <td className="py-3 px-4 font-semibold text-foreground">{pedido.numero}</td>
                        <td className="py-3 px-4 text-muted">{pedido.sede?.nombre_sede || '—'}</td>
                        <td className="py-3 px-4 text-muted">{formatDate(pedido.fecha_creacion)}</td>
                        {showPrices && (
                          <td className="py-3 px-4 text-right font-semibold">{formatCOP(pedido.valor_total_cop || 0)}</td>
                        )}
                        <td className="py-3 px-4 text-center">
                          <StatusBadge estado={pedido.estado} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Link
                            href={`/dashboard/pedidos/${pedido.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-background-light px-3 py-1.5 text-sm font-medium text-foreground hover:bg-border"
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

          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">Sedes</h2>
            {sedes.length === 0 ? (
              <p className="text-sm text-muted">Esta empresa no tiene sedes registradas.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sedes.map((sede) => (
                  <div key={sede.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{sede.nombre_sede}</p>
                        <p className="text-xs text-muted mt-1">{sede.direccion || 'Sin dirección registrada'}</p>
                        <p className="text-xs text-muted">{sede.ciudad || 'Sin ciudad'}</p>
                      </div>
                    </div>
                    {(sede.contacto_nombre || sede.contacto_telefono) && (
                      <div className="mt-3 space-y-1 text-xs text-muted">
                        {sede.contacto_nombre && (
                          <p className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {sede.contacto_nombre}
                          </p>
                        )}
                        {sede.contacto_telefono && (
                          <p className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {sede.contacto_telefono}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted" />
                <h2 className="font-semibold text-foreground">Productos autorizados</h2>
                {!loadingProductos && (
                  <span className="text-xs text-muted">({productosFiltrados.length})</span>
                )}
              </div>
            </div>

            {loadingProductos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : productosOdoo.length === 0 ? (
              <p className="text-sm text-muted">
                {productosAutorizadosIds.size === 0
                  ? 'No se han configurado productos específicos para esta empresa.'
                  : 'No se encontraron productos en Odoo para los IDs autorizados.'}
              </p>
            ) : (
              <>
                {productosOdoo.length > 6 && (
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      placeholder="Buscar producto por nombre o referencia"
                      className="w-full rounded-lg border border-border bg-background-light py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {productosFiltrados.map((producto) => (
                    <div key={producto.id} className="rounded-lg border border-border p-3">
                      <div className="flex gap-3">
                        {producto.image_128 ? (
                          <img
                            src={`data:image/png;base64,${producto.image_128}`}
                            alt={producto.name}
                            className="w-14 h-14 rounded-lg border border-border object-contain bg-background-light p-1 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg border border-border bg-background-light flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-muted/40" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground leading-tight truncate">{producto.name}</p>
                          <p className="text-xs text-muted mt-1">
                            Ref: {typeof producto.default_code === 'string' ? producto.default_code : '—'}
                          </p>
                          {Array.isArray(producto.categ_id) && (
                            <p className="text-xs text-muted">{producto.categ_id[1]}</p>
                          )}
                          {showPrices && (
                            <p className="text-xs font-semibold text-primary mt-1">
                              {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(producto.list_price || 0)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">Ficha del cliente</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted">Partner Odoo</p>
                <p className="font-medium text-foreground">{cliente.odoo_partner_id || 'Sin sincronizar'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Comercial Odoo</p>
                <p className="font-medium text-foreground">
                  {cliente.odoo_comercial_nombre || 'Sin comercial Odoo'}
                  {cliente.odoo_comercial_id ? ` · ID ${cliente.odoo_comercial_id}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Presupuesto global mensual</p>
                <p className="font-medium text-foreground">
                  {cliente.presupuesto_global_mensual ? formatCOP(cliente.presupuesto_global_mensual) : 'No definido'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Cliente desde</p>
                <p className="font-medium text-foreground">{formatDate(cliente.created_at)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">Usuarios del cliente</h2>
            {usuarios.length === 0 ? (
              <p className="text-sm text-muted">No hay usuarios asociados a esta empresa.</p>
            ) : (
              <div className="space-y-3">
                {usuarios.map((usuario) => (
                  <div key={usuario.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{usuario.nombre} {usuario.apellido}</p>
                        <p className="text-xs text-muted mt-0.5">{usuario.email}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${usuario.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-2">Rol: {usuario.rol}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
