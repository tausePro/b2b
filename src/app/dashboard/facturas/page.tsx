'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, formatDate } from '@/lib/utils';
import { FileText, Loader2 } from 'lucide-react';

interface FacturaRow {
  id: string;
  numero: string;
  estado: string;
  valor_total_cop: number;
  fecha_creacion: string;
  sede: { nombre_sede: string } | null;
}

export default function FacturasPage() {
  const { user, showPrices } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FacturaRow[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchFacturas = async () => {
      if (!user) return;

      setLoading(true);

      let query = supabase
        .from('pedidos')
        .select('id, numero, estado, valor_total_cop, fecha_creacion, sede:sedes(nombre_sede)')
        .in('estado', ['aprobado', 'en_validacion_imprima', 'procesado_odoo'])
        .order('fecha_creacion', { ascending: false })
        .limit(50);

      if (user.rol === 'comprador') {
        query = query.eq('usuario_creador_id', user.id);
      } else if (user.empresa_id) {
        query = query.eq('empresa_id', user.empresa_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error cargando facturas/pedidos facturables:', error);
        setRows([]);
      } else {
        const parsedRows = ((data as Array<Record<string, unknown>>) || []).map((item) => {
          const sedeValue = item.sede as Array<{ nombre_sede: string }> | { nombre_sede: string } | null;
          const sedeNormalizada = Array.isArray(sedeValue) ? (sedeValue[0] ?? null) : sedeValue;

          return {
            id: String(item.id),
            numero: String(item.numero),
            estado: String(item.estado),
            valor_total_cop: Number(item.valor_total_cop || 0),
            fecha_creacion: String(item.fecha_creacion),
            sede: sedeNormalizada ? { nombre_sede: sedeNormalizada.nombre_sede } : null,
          } satisfies FacturaRow;
        });

        setRows(parsedRows);
      }

      setLoading(false);
    };

    fetchFacturas();
  }, [supabase, user]);

  const resumen = useMemo(() => {
    const facturados = rows.filter((r) => r.estado === 'procesado_odoo');
    const pendientes = rows.filter((r) => r.estado !== 'procesado_odoo');

    return {
      total: rows.length,
      facturados: facturados.length,
      pendientes: pendientes.length,
      valorTotal: rows.reduce((sum, row) => sum + (row.valor_total_cop || 0), 0),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Facturas</h1>
        <p className="text-muted text-sm mt-1">Seguimiento de pedidos facturados o en proceso de facturación</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted">Pedidos en ciclo</p>
          <p className="text-2xl font-bold text-foreground mt-1">{resumen.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted">Facturados</p>
          <p className="text-2xl font-bold text-success mt-1">{resumen.facturados}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted">Pendientes</p>
          <p className="text-2xl font-bold text-warning mt-1">{resumen.pendientes}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted">Valor en ciclo</p>
          <p className="text-lg font-bold text-foreground mt-1">{showPrices ? formatCOP(resumen.valorTotal) : 'Oculto por rol'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Estado de facturación por pedido</h2>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-border mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">Aún no hay pedidos facturables</h3>
            <p className="text-sm text-muted mt-1">
              Cuando tus pedidos avancen en el flujo, aparecerán aquí con su estado de facturación.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                  <th className="text-left py-3 px-4 font-medium text-muted">Fecha</th>
                  {showPrices && <th className="text-right py-3 px-4 font-medium text-muted">Valor</th>}
                  <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const estadoLabel =
                    row.estado === 'procesado_odoo'
                      ? 'Facturado'
                      : row.estado === 'en_validacion_imprima'
                        ? 'Validación Imprima'
                        : 'Pendiente de facturar';

                  const estadoClass =
                    row.estado === 'procesado_odoo'
                      ? 'bg-success/10 text-success'
                      : row.estado === 'en_validacion_imprima'
                        ? 'bg-info/10 text-info'
                        : 'bg-warning/10 text-warning';

                  return (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-background-light/30">
                      <td className="py-3 px-4 font-semibold text-foreground">{row.numero}</td>
                      <td className="py-3 px-4 text-muted">{row.sede?.nombre_sede || '—'}</td>
                      <td className="py-3 px-4 text-muted">{formatDate(row.fecha_creacion)}</td>
                      {showPrices && (
                        <td className="py-3 px-4 text-right font-medium">{formatCOP(row.valor_total_cop)}</td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${estadoClass}`}>
                          {estadoLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
