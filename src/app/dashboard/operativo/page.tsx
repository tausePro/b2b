'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  AlertTriangle,
  Package,
  ShoppingBag,
  Users,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';

interface EtapaCount {
  nombre: string;
  cantidad: number;
  color: string;
}

interface AlertaReal {
  tipo: 'danger' | 'warning';
  mensaje: string;
  detalle: string;
}

interface AsesorCarga {
  id: string;
  nombre: string;
  apellido: string;
  pendientes: number;
  enProceso: number;
  completados: number;
  total: number;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: 'bg-gray-200' },
  en_aprobacion: { label: 'En Aprobación', color: 'bg-yellow-200' },
  aprobado: { label: 'Aprobado', color: 'bg-green-200' },
  en_validacion_imprima: { label: 'Validación Imprima', color: 'bg-blue-200' },
  procesado_odoo: { label: 'Procesado Odoo', color: 'bg-primary/20' },
  rechazado: { label: 'Rechazado', color: 'bg-red-200' },
};

const supabase = createClient();

export default function OperativoPage() {
  const [loading, setLoading] = useState(true);
  const [etapas, setEtapas] = useState<EtapaCount[]>([]);
  const [alertas, setAlertas] = useState<AlertaReal[]>([]);
  const [asesoresCarga, setAsesoresCarga] = useState<AsesorCarga[]>([]);
  const [totalActivos, setTotalActivos] = useState(0);
  const [totalRetrasados, setTotalRetrasados] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // 1. Todos los pedidos para conteo por estado
      const { data: todosPedidos } = await supabase
        .from('pedidos')
        .select('id, estado, fecha_creacion, numero_pedido, empresa_id, empresas(nombre)');

      const pedidos = todosPedidos ?? [];

      // Conteo por estado
      const conteo: Record<string, number> = {};
      for (const p of pedidos) {
        conteo[p.estado] = (conteo[p.estado] || 0) + 1;
      }

      const etapasArr: EtapaCount[] = Object.entries(ESTADO_CONFIG)
        .map(([key, cfg]) => ({
          nombre: cfg.label,
          cantidad: conteo[key] || 0,
          color: cfg.color,
        }))
        .filter((e) => e.cantidad > 0);

      setEtapas(etapasArr);

      // Pedidos activos (no rechazados, no procesados)
      const activos = pedidos.filter((p) =>
        !['rechazado', 'procesado_odoo'].includes(p.estado)
      );
      setTotalActivos(activos.length);

      // 2. Alertas reales: pedidos con más de 24h en_aprobacion o en_validacion_imprima
      const ahora = new Date();
      const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);

      const alertasArr: AlertaReal[] = [];
      let retrasados = 0;

      for (const p of pedidos) {
        const fechaCreacion = new Date(p.fecha_creacion);
        const empresaNombre = (p.empresas as unknown as { nombre: string })?.nombre ?? '';

        if (p.estado === 'en_aprobacion' && fechaCreacion < hace48h) {
          retrasados++;
          alertasArr.push({
            tipo: 'danger',
            mensaje: `${p.numero_pedido} lleva más de 48 hrs sin aprobación`,
            detalle: empresaNombre,
          });
        } else if (p.estado === 'en_aprobacion' && fechaCreacion < hace24h) {
          retrasados++;
          alertasArr.push({
            tipo: 'warning',
            mensaje: `${p.numero_pedido} pendiente de aprobación por más de 24 hrs`,
            detalle: empresaNombre,
          });
        } else if (p.estado === 'en_validacion_imprima' && fechaCreacion < hace24h) {
          retrasados++;
          alertasArr.push({
            tipo: 'warning',
            mensaje: `${p.numero_pedido} pendiente de validación por más de 24 hrs`,
            detalle: empresaNombre,
          });
        }
      }

      setTotalRetrasados(retrasados);
      setAlertas(alertasArr.slice(0, 8));

      // 3. Carga por asesor
      const { data: asesoresList } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido')
        .eq('rol', 'asesor')
        .eq('activo', true);

      if (asesoresList && asesoresList.length > 0) {
        const carga: AsesorCarga[] = await Promise.all(
          asesoresList.map(async (asesor) => {
            const { data: asignaciones } = await supabase
              .from('asesor_empresas')
              .select('empresa_id')
              .eq('usuario_id', asesor.id)
              .eq('activo', true);

            const empresaIds = asignaciones?.map((a) => a.empresa_id) || [];
            let pendientes = 0;
            let enProceso = 0;
            let completados = 0;

            if (empresaIds.length > 0) {
              const { data: pedidosAsesor } = await supabase
                .from('pedidos')
                .select('estado')
                .in('empresa_id', empresaIds);

              for (const p of pedidosAsesor ?? []) {
                if (['en_aprobacion', 'en_validacion_imprima'].includes(p.estado)) {
                  pendientes++;
                } else if (['aprobado', 'borrador'].includes(p.estado)) {
                  enProceso++;
                } else if (p.estado === 'procesado_odoo') {
                  completados++;
                }
              }
            }

            return {
              id: asesor.id,
              nombre: asesor.nombre,
              apellido: asesor.apellido,
              pendientes,
              enProceso,
              completados,
              total: pendientes + enProceso + completados,
            };
          })
        );

        carga.sort((a, b) => b.total - a.total);
        setAsesoresCarga(carga);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const totalEtapas = etapas.reduce((s, e) => s + e.cantidad, 0);

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
        <h1 className="text-2xl font-bold text-foreground">Control Operativo</h1>
        <p className="text-muted text-sm mt-1">Monitoreo en tiempo real de la operación</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Pedidos Retrasados"
          value={String(totalRetrasados)}
          subtitle="Requieren atención"
          icon={<AlertTriangle className="w-5 h-5" />}
        />
        <KpiCard
          title="Pedidos Activos"
          value={String(totalActivos)}
          subtitle="En proceso"
          icon={<Package className="w-5 h-5" />}
        />
        <KpiCard
          title="Total Pedidos"
          value={String(totalEtapas)}
          subtitle="Todas las etapas"
          icon={<ShoppingBag className="w-5 h-5" />}
        />
        <KpiCard
          title="Asesores"
          value={String(asesoresCarga.length)}
          subtitle="Con empresas asignadas"
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      {/* Mapa de calor: pedidos por etapa */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-4">Pedidos por Etapa</h2>
        {etapas.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">No hay pedidos registrados.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {etapas.map((etapa) => {
              const pct = totalEtapas > 0 ? (etapa.cantidad / totalEtapas) * 100 : 0;
              return (
                <div key={etapa.nombre} className={cn('rounded-xl p-4 text-center', etapa.color)}>
                  <p className="text-2xl font-bold text-foreground">{etapa.cantidad}</p>
                  <p className="text-xs font-medium text-foreground/70 mt-1">{etapa.nombre}</p>
                  <p className="text-xs text-foreground/50">{pct.toFixed(0)}%</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas críticas */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-danger" />
            Alertas — Pedidos Retrasados
          </h2>
          {alertas.length === 0 ? (
            <div className="text-center py-6">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-muted">No hay pedidos retrasados.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertas.map((alerta, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border',
                    alerta.tipo === 'danger'
                      ? 'bg-danger/5 border-danger/20'
                      : 'bg-warning/5 border-warning/20'
                  )}
                >
                  <p className="text-sm font-medium text-foreground">{alerta.mensaje}</p>
                  <p className="text-xs text-muted mt-1">{alerta.detalle}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carga por asesor */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Carga por Asesor</h2>
          </div>
          {asesoresCarga.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-muted">No hay asesores activos.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background-light/50">
                    <th className="text-left py-3 px-4 font-medium text-muted">Asesor</th>
                    <th className="text-center py-3 px-4 font-medium text-muted">Pend.</th>
                    <th className="text-center py-3 px-4 font-medium text-muted">Proceso</th>
                    <th className="text-center py-3 px-4 font-medium text-muted">Compl.</th>
                    <th className="text-center py-3 px-4 font-medium text-muted">Eficiencia</th>
                  </tr>
                </thead>
                <tbody>
                  {asesoresCarga.map((t) => {
                    const eficiencia = t.total > 0 ? Math.round((t.completados / t.total) * 100) : 0;
                    return (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="py-3 px-4 font-medium text-foreground">
                          {t.nombre} {t.apellido}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-warning/10 text-warning text-xs font-bold">
                            {t.pendientes}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">
                            {t.enProceso}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-600 text-xs font-bold">
                            {t.completados}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 bg-background-light rounded-full h-2">
                              <div
                                className={cn(
                                  'h-2 rounded-full',
                                  eficiencia >= 80 ? 'bg-green-500' : eficiencia >= 50 ? 'bg-primary' : 'bg-warning'
                                )}
                                style={{ width: `${eficiencia}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">{eficiencia}%</span>
                          </div>
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
    </div>
  );
}
