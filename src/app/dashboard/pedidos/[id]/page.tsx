'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, formatDateTime, getEstadoColor, getEstadoLabel } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ArrowLeft,
  Printer,
  Check,
  X,
  Loader2,
  MapPin,
  User,
  Phone,
  Clock,
  FileText,
  Package,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface PedidoDetalle {
  id: string;
  numero: string;
  estado: string;
  odoo_sale_order_id: number | null;
  valor_total_cop: number;
  total_items: number;
  comentarios_sede: string | null;
  comentarios_aprobador: string | null;
  excede_presupuesto: boolean;
  justificacion_exceso: string | null;
  fecha_creacion: string;
  updated_at: string;
  fecha_aprobacion: string | null;
  fecha_validacion: string | null;
  empresa: { nombre: string } | null;
  sede: { nombre_sede: string; direccion: string; ciudad: string; contacto_nombre: string; contacto_telefono: string } | null;
  creador: { nombre: string; apellido: string; email: string } | null;
}

interface ItemDetalle {
  id: string;
  odoo_product_id: number;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
  subtotal_cop: number;
}

interface LogEntry {
  id: string;
  accion: string;
  descripcion: string;
  usuario_nombre: string;
  created_at: string;
}

interface OdooSaleOrderSummary {
  id: number;
  name: string | null;
  state: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  currencyName: string | null;
}

export default function DetallePedidoPage() {
  const { user, showPrices } = useAuth();
  const params = useParams();
  const router = useRouter();
  const pedidoId = params.id as string;

  const [pedido, setPedido] = useState<PedidoDetalle | null>(null);
  const [items, setItems] = useState<ItemDetalle[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [odooSummary, setOdooSummary] = useState<OdooSaleOrderSummary | null>(null);
  const [loadingOdooSummary, setLoadingOdooSummary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchPedido();
  }, [pedidoId]);

  const fetchOdooSummary = async (targetPedidoId: string) => {
    setLoadingOdooSummary(true);

    try {
      const response = await fetch(`/api/pedidos/${targetPedidoId}/odoo-resumen`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'No se pudo cargar el resumen de Odoo.');
      }

      setOdooSummary((payload.odoo_sale_order || null) as OdooSaleOrderSummary | null);
    } catch (error) {
      console.error('Error cargando resumen de Odoo:', error);
      setOdooSummary(null);
    } finally {
      setLoadingOdooSummary(false);
    }
  };

  const fetchPedido = async () => {
    setLoading(true);

    const [pedidoRes, itemsRes, logsRes] = await Promise.all([
      supabase
        .from('pedidos')
        .select(`
          id, numero, estado, odoo_sale_order_id, valor_total_cop, total_items, comentarios_sede, comentarios_aprobador,
          excede_presupuesto, justificacion_exceso, fecha_creacion, updated_at,
          fecha_aprobacion, fecha_validacion,
          empresa:empresas(nombre),
          sede:sedes(nombre_sede, direccion, ciudad, contacto_nombre, contacto_telefono),
          creador:usuarios!pedidos_usuario_creador_id_fkey(nombre, apellido, email)
        `)
        .eq('id', pedidoId)
        .single(),
      supabase
        .from('pedido_items')
        .select('id, odoo_product_id, nombre_producto, cantidad, precio_unitario_cop, subtotal_cop')
        .eq('pedido_id', pedidoId)
        .order('created_at'),
      supabase
        .from('logs_trazabilidad')
        .select('id, accion, descripcion, usuario_nombre, created_at')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false }),
    ]);

    if (pedidoRes.data) {
      const pedidoData = pedidoRes.data as unknown as PedidoDetalle;
      setPedido(pedidoData);

      if (pedidoData.odoo_sale_order_id) {
        await fetchOdooSummary(pedidoData.id);
      } else {
        setOdooSummary(null);
        setLoadingOdooSummary(false);
      }
    } else {
      setOdooSummary(null);
      setLoadingOdooSummary(false);
    }

    if (itemsRes.data) setItems(itemsRes.data as unknown as ItemDetalle[]);
    if (logsRes.data) setLogs(logsRes.data as LogEntry[]);

    setLoading(false);
  };

  const handleAction = async (accion: 'aprobar' | 'rechazar' | 'validar') => {
    if (!user || !pedido) return;
    setProcesando(true);

    if (accion === 'aprobar') {
      try {
        const response = await fetch(`/api/pedidos/${pedido.id}/aprobar`, {
          method: 'POST',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.details || payload.error || 'No se pudo aprobar el pedido.');
        }

        if (payload.warning) {
          console.warn('[DetallePedido] Advertencia al registrar trazabilidad:', payload.warning);
        }

        await fetchPedido();
      } catch (error) {
        console.error('Error aprobando pedido y enviando a Odoo:', error);
        alert(error instanceof Error ? error.message : 'No se pudo aprobar el pedido y enviarlo a Odoo.');
      } finally {
        setProcesando(false);
      }
      return;
    }

    const updates: Record<string, unknown> = {};
    let logDescripcion = '';

    switch (accion) {
      case 'rechazar':
        updates.estado = 'rechazado';
        logDescripcion = 'Pedido rechazado por gerencia';
        break;
      case 'validar':
        updates.estado = 'en_validacion_imprima';
        updates.validado_por = user.id;
        updates.fecha_validacion = new Date().toISOString();
        logDescripcion = 'Pedido en validación por asesor Imprima. Listo para sincronizar con Odoo.';
        break;
    }

    const { error } = await supabase
      .from('pedidos')
      .update(updates)
      .eq('id', pedido.id);

    if (!error) {
      await supabase.from('logs_trazabilidad').insert({
        pedido_id: pedido.id,
        accion,
        descripcion: logDescripcion,
        usuario_id: user.id,
        usuario_nombre: `${user.nombre} ${user.apellido}`,
      });
      fetchPedido();
    }
    setProcesando(false);
  };

  const getAccionIcon = (accion: string) => {
    switch (accion) {
      case 'creacion': return <Package className="w-4 h-4 text-info" />;
      case 'aprobacion': case 'aprobar': return <Check className="w-4 h-4 text-success" />;
      case 'rechazo': case 'rechazar': return <X className="w-4 h-4 text-danger" />;
      case 'validacion': case 'validar': return <Check className="w-4 h-4 text-primary" />;
      default: return <Clock className="w-4 h-4 text-muted" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">Pedido no encontrado.</p>
        <Link href="/dashboard/pedidos" className="text-primary hover:text-primary-dark text-sm font-medium mt-2 inline-block">
          Volver a pedidos
        </Link>
      </div>
    );
  }

  const canApprove = user?.rol === 'aprobador' && pedido.estado === 'en_aprobacion';
  const canValidate = user?.rol === 'asesor' && pedido.estado === 'aprobado' && !pedido.odoo_sale_order_id;
  const estadoVisual = pedido.odoo_sale_order_id ? 'procesado_odoo' : pedido.estado;
  const subtotalVisual = odooSummary?.amountUntaxed ?? pedido.valor_total_cop;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-white border border-border transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{pedido.numero}</h1>
              <StatusBadge estado={estadoVisual} />
            </div>
            <p className="text-muted text-sm mt-0.5">
              Creado el {formatDateTime(pedido.fecha_creacion)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-white transition-colors">
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          {canApprove && (
            <>
              <button
                onClick={() => handleAction('rechazar')}
                disabled={procesando}
                className="inline-flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger rounded-lg text-sm font-medium hover:bg-danger hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Rechazar
              </button>
              <button
                onClick={() => handleAction('aprobar')}
                disabled={procesando}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Aprobar Pedido
              </button>
            </>
          )}
          {canValidate && (
            <button
              onClick={() => handleAction('validar')}
              disabled={procesando}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Validar Pedido
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items del pedido */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Productos del Pedido</h2>
              <p className="text-xs text-muted mt-0.5">{pedido.total_items} items</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background-light/50">
                    <th className="text-left py-3 px-4 font-medium text-muted">Producto</th>
                    <th className="text-left py-3 px-4 font-medium text-muted">Categoría</th>
                    <th className="text-center py-3 px-4 font-medium text-muted">Cantidad</th>
                    {showPrices && (
                      <>
                        <th className="text-right py-3 px-4 font-medium text-muted">P. Unitario</th>
                        <th className="text-right py-3 px-4 font-medium text-muted">Subtotal</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-foreground">{item.nombre_producto}</p>
                        <p className="text-xs text-muted">Odoo ID: {item.odoo_product_id}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Producto
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-medium">
                        {item.cantidad}
                      </td>
                      {showPrices && (
                        <>
                          <td className="py-3 px-4 text-right text-muted">{formatCOP(item.precio_unitario_cop)}</td>
                          <td className="py-3 px-4 text-right font-semibold">{formatCOP(item.subtotal_cop)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {showPrices && (
                  <tfoot>
                    <tr className="bg-background-light/50">
                      <td colSpan={3} />
                      <td className="py-3 px-4 text-right font-semibold text-muted">Subtotal</td>
                      <td className="py-3 px-4 text-right font-bold text-lg text-primary">{formatCOP(pedido.valor_total_cop)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Observaciones */}
          {pedido.comentarios_sede && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted" />
                Comentarios de Sede
              </h2>
              <p className="text-sm text-muted">{pedido.comentarios_sede}</p>
            </div>
          )}

          {pedido.comentarios_aprobador && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted" />
                Comentarios del Aprobador
              </h2>
              <p className="text-sm text-muted">{pedido.comentarios_aprobador}</p>
            </div>
          )}

          {pedido.excede_presupuesto && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-warning">Este pedido excede el presupuesto de la sede</p>
              {pedido.justificacion_exceso && (
                <p className="text-xs text-muted mt-1">Justificación: {pedido.justificacion_exceso}</p>
              )}
            </div>
          )}

          {/* Timeline de trazabilidad */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">Historial y Trazabilidad</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin registros de actividad.</p>
            ) : (
              <div className="space-y-0">
                {logs.map((log, index) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-background-light flex items-center justify-center shrink-0">
                        {getAccionIcon(log.accion)}
                      </div>
                      {index < logs.length - 1 && (
                        <div className="w-px h-full bg-border min-h-[2rem]" />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-foreground">{log.descripcion}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {log.usuario_nombre} — {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Info de entrega */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-3">Información de Entrega</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{pedido.sede?.nombre_sede}</p>
                  <p className="text-xs text-muted">{pedido.sede?.direccion}</p>
                  <p className="text-xs text-muted">{pedido.sede?.ciudad}</p>
                </div>
              </div>
              {pedido.sede?.contacto_nombre && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted shrink-0" />
                  <p className="text-sm text-muted">{pedido.sede.contacto_nombre}</p>
                </div>
              )}
              {pedido.sede?.contacto_telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted shrink-0" />
                  <p className="text-sm text-muted">{pedido.sede.contacto_telefono}</p>
                </div>
              )}
            </div>
          </div>

          {/* Info del solicitante */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-3">Solicitante</h2>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {pedido.creador?.nombre} {pedido.creador?.apellido}
              </p>
              <p className="text-xs text-muted">{pedido.creador?.email}</p>
              <p className="text-xs text-muted">{pedido.empresa?.nombre}</p>
            </div>
          </div>

          {/* Resumen de valores */}
          {showPrices && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-3">Resumen</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-medium">{formatCOP(subtotalVisual)}</span>
                </div>
              </div>
              {loadingOdooSummary ? (
                <p className="text-xs text-muted mt-3">Cargando impuestos reales desde Odoo...</p>
              ) : odooSummary ? (
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Impuestos</span>
                    <span className="font-medium">{formatCOP(odooSummary.amountTax)}</span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="font-bold text-lg text-primary">{formatCOP(odooSummary.amountTotal)}</span>
                  </div>
                  {odooSummary.name && (
                    <p className="text-xs text-muted">Totales sincronizados desde Odoo ({odooSummary.name}).</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted mt-3">
                  Los impuestos varían por producto y se calculan en Odoo al generar la cotización.
                </p>
              )}
            </div>
          )}

          {/* Estado actual */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-3">Estado Actual</h2>
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge estado={estadoVisual} />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <p>Creado: {formatDateTime(pedido.fecha_creacion)}</p>
              {pedido.fecha_aprobacion && <p>Aprobado: {formatDateTime(pedido.fecha_aprobacion)}</p>}
              {pedido.fecha_validacion && <p>Validado: {formatDateTime(pedido.fecha_validacion)}</p>}
              {pedido.odoo_sale_order_id && <p>Cotización Odoo ID: {pedido.odoo_sale_order_id}</p>}
              <p>Última actualización: {formatDateTime(pedido.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
