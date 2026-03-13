'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, getPedidoEstadoVisual } from '@/lib/utils';
import { BarChart3, Loader2 } from 'lucide-react';

interface ReportePedido {
  id: string;
  estado: string;
  odoo_sale_order_id: number | null;
  valor_total_cop: number;
  fecha_creacion: string;
  sede: { nombre_sede: string } | null;
}

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  en_aprobacion: 'En aprobación',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  en_validacion_imprima: 'Validación Imprima',
  procesado_odoo: 'Procesado Odoo',
};

export default function ReportesPage() {
  const { user, showPrices } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReportePedido[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      setLoading(true);

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 60);

      let query = supabase
        .from('pedidos')
        .select('id, estado, odoo_sale_order_id, valor_total_cop, fecha_creacion, sede:sedes(nombre_sede)')
        .gte('fecha_creacion', dateFrom.toISOString())
        .order('fecha_creacion', { ascending: false })
        .limit(500);

      if (user.rol === 'comprador') {
        query = query.eq('usuario_creador_id', user.id);
      } else if (user.empresa_id) {
        query = query.eq('empresa_id', user.empresa_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error cargando reportes:', error);
        setRows([]);
      } else {
        const parsedRows = ((data as Array<Record<string, unknown>>) || []).map((item) => {
          const sedeValue = item.sede as Array<{ nombre_sede: string }> | { nombre_sede: string } | null;
          const sedeNormalizada = Array.isArray(sedeValue) ? (sedeValue[0] ?? null) : sedeValue;

          return {
            id: String(item.id),
            estado: String(item.estado),
            odoo_sale_order_id: item.odoo_sale_order_id == null ? null : Number(item.odoo_sale_order_id),
            valor_total_cop: Number(item.valor_total_cop || 0),
            fecha_creacion: String(item.fecha_creacion),
            sede: sedeNormalizada ? { nombre_sede: sedeNormalizada.nombre_sede } : null,
          } satisfies ReportePedido;
        });

        setRows(parsedRows);
      }

      setLoading(false);
    };

    fetchData();
  }, [supabase, user]);

  const resumen = useMemo(() => {
    const totalPedidos = rows.length;
    const valorTotal = rows.reduce((sum, row) => sum + row.valor_total_cop, 0);
    const ticketPromedio = totalPedidos > 0 ? valorTotal / totalPedidos : 0;

    const porEstado = rows.reduce<Record<string, { count: number; valor: number }>>((acc, row) => {
      const estadoVisual = getPedidoEstadoVisual(row.estado, row.odoo_sale_order_id);
      if (!acc[estadoVisual]) {
        acc[estadoVisual] = { count: 0, valor: 0 };
      }
      acc[estadoVisual].count += 1;
      acc[estadoVisual].valor += row.valor_total_cop;
      return acc;
    }, {});

    const porSede = rows.reduce<Record<string, { count: number; valor: number }>>((acc, row) => {
      const sede = row.sede?.nombre_sede || 'Sin sede';
      if (!acc[sede]) {
        acc[sede] = { count: 0, valor: 0 };
      }
      acc[sede].count += 1;
      acc[sede].valor += row.valor_total_cop;
      return acc;
    }, {});

    const topSedes = Object.entries(porSede)
      .map(([sede, values]) => ({ sede, ...values }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalPedidos,
      valorTotal,
      ticketPromedio,
      porEstado,
      topSedes,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        <p className="text-muted text-sm mt-1">Indicadores de pedidos de los últimos 60 días</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs text-muted">Total pedidos</p>
              <p className="text-2xl font-bold text-foreground mt-1">{resumen.totalPedidos}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs text-muted">Valor total</p>
              <p className="text-xl font-bold text-foreground mt-1">
                {showPrices ? formatCOP(resumen.valorTotal) : 'Oculto por rol'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs text-muted">Ticket promedio</p>
              <p className="text-xl font-bold text-foreground mt-1">
                {showPrices ? formatCOP(resumen.ticketPromedio) : 'Oculto por rol'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Distribución por estado</h2>
              </div>
              {Object.keys(resumen.porEstado).length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">No hay datos en el periodo seleccionado.</div>
              ) : (
                <div className="divide-y divide-border">
                  {Object.entries(resumen.porEstado)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([estado, values]) => (
                      <div key={estado} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{ESTADO_LABELS[estado] || estado}</p>
                          <p className="text-xs text-muted">{values.count} pedido(s)</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {showPrices ? formatCOP(values.valor) : '—'}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted" />
                <h2 className="font-semibold text-foreground">Top sedes por volumen</h2>
              </div>
              {resumen.topSedes.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">No hay sedes con actividad reciente.</div>
              ) : (
                <div className="divide-y divide-border">
                  {resumen.topSedes.map((row) => (
                    <div key={row.sede} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{row.sede}</p>
                        <p className="text-xs text-muted">{row.count} pedido(s)</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {showPrices ? formatCOP(row.valor) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      
      {!loading && rows.length === 0 && (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted">Aún no hay pedidos en los últimos 60 días para construir reportes.</p>
        </div>
      )}
      </div>
    
  );
}
