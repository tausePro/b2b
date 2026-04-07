'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, cn } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import {
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Bell,
  Pencil,
  Save,
  Check,
} from 'lucide-react';

interface PresupuestoItem {
  id: string;
  monto_inicial: number;
  monto_consumido: number;
  monto_disponible: number;
  estado: string;
  mes: number;
  anio: number;
  sede: { nombre_sede: string; presupuesto_alerta_threshold: number } | null;
}

export default function PresupuestosPage() {
  const { user } = useAuth();
  const [presupuestos, setPresupuestos] = useState<PresupuestoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const supabase = createClient();

  const canEditBudget = user?.rol === 'aprobador' || user?.rol === 'super_admin' || user?.rol === 'direccion';

  const handleSavePresupuesto = async (presupuestoId: string) => {
    const num = Number(editValue);
    if (!Number.isFinite(num) || num < 0) return;
    setSavingId(presupuestoId);
    const { error } = await supabase
      .from('presupuestos_mensuales')
      .update({ monto_inicial: num, monto_disponible: num - (presupuestos.find((p) => p.id === presupuestoId)?.monto_consumido ?? 0) })
      .eq('id', presupuestoId);
    if (!error) {
      setPresupuestos((prev) => prev.map((p) => p.id === presupuestoId ? { ...p, monto_inicial: num, monto_disponible: num - p.monto_consumido } : p));
      setSaveSuccess(presupuestoId);
      setTimeout(() => setSaveSuccess(null), 2000);
    }
    setEditingId(null);
    setEditValue('');
    setSavingId(null);
  };

  useEffect(() => {
    const fetchPresupuestos = async () => {
      if (!user) return;
      setLoading(true);

      const mesActual = new Date().getMonth() + 1;
      const anioActual = new Date().getFullYear();

      const { data, error } = await supabase
        .from('presupuestos_mensuales')
        .select(`
          id, monto_inicial, monto_consumido, monto_disponible, estado, mes, anio,
          sede:sedes(nombre_sede, presupuesto_alerta_threshold)
        `)
        .eq('mes', mesActual)
        .eq('anio', anioActual)
        .order('monto_inicial', { ascending: false });

      if (error) {
        console.error('Error fetching presupuestos:', error);
      } else {
        setPresupuestos((data as unknown as PresupuestoItem[]) || []);
      }
      setLoading(false);
    };

    fetchPresupuestos();
  }, [user, supabase]);

  const totalMensual = presupuestos.reduce((s, p) => s + p.monto_inicial, 0);
  const totalEjecutado = presupuestos.reduce((s, p) => s + p.monto_consumido, 0);
  const totalDisponible = presupuestos.reduce((s, p) => s + p.monto_disponible, 0);
  const porcentajeGlobal = totalMensual > 0 ? (totalEjecutado / totalMensual) * 100 : 0;
  const alertasActivas = presupuestos.filter((p) => {
    const pct = p.monto_inicial > 0 ? (p.monto_consumido / p.monto_inicial) * 100 : 0;
    const threshold = p.sede?.presupuesto_alerta_threshold ?? 90;
    return pct >= threshold;
  }).length;

  const getBarColor = (pct: number, threshold: number) => {
    if (pct >= threshold) return 'bg-danger';
    if (pct >= threshold * 0.78) return 'bg-warning'; // ~70% del threshold
    return 'bg-primary';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Control Presupuestal</h1>
        <p className="text-muted text-sm mt-1">Monitoreo de presupuestos mensuales por sede</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Presupuesto Global Mensual"
          value={formatCOP(totalMensual)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Ejecución Actual"
          value={`${porcentajeGlobal.toFixed(1)}%`}
          subtitle={formatCOP(totalEjecutado)}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <KpiCard
          title="Disponible"
          value={formatCOP(totalDisponible)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          title="Alertas Activas"
          value={String(alertasActivas)}
          subtitle="Sedes con alerta"
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      </div>

      {/* Barra global */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-3">Ejecución Global</h2>
        <div className="w-full bg-background-light rounded-full h-4 mb-2">
          <div
            className={cn('h-4 rounded-full transition-all', getBarColor(porcentajeGlobal, 90))}
            style={{ width: `${Math.min(porcentajeGlobal, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Consumido: {formatCOP(totalEjecutado)}</span>
          <span>Disponible: {formatCOP(totalDisponible)}</span>
        </div>
      </div>

      {/* Umbrales de notificación */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted" />
          Umbrales de Notificación
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-warning/5 rounded-lg border border-warning/20">
            <div className="w-3 h-3 rounded-full bg-warning shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Alerta Amarilla</p>
              <p className="text-xs text-muted">Se activa al alcanzar el 70% del presupuesto</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-danger/5 rounded-lg border border-danger/20">
            <div className="w-3 h-3 rounded-full bg-danger shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Alerta Roja</p>
              <p className="text-xs text-muted">Se activa al alcanzar el 90% del presupuesto</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla por sede */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Presupuesto por Sede</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          </div>
        ) : presupuestos.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted">No hay presupuestos configurados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-light/50">
                  <th className="text-left py-3 px-4 font-medium text-muted">Sede</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Presupuesto</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Ejecutado</th>
                  <th className="text-right py-3 px-4 font-medium text-muted">Disponible</th>
                  <th className="py-3 px-4 font-medium text-muted w-48">Progreso</th>
                  <th className="text-center py-3 px-4 font-medium text-muted">Estado</th>
                </tr>
              </thead>
              <tbody>
                {presupuestos.map((p) => {
                  const pct = p.monto_inicial > 0 ? (p.monto_consumido / p.monto_inicial) * 100 : 0;
                  const threshold = p.sede?.presupuesto_alerta_threshold ?? 90;
                  const barColor = getBarColor(pct, threshold);
                  const isWarning = pct >= threshold * 0.78 && pct < threshold;
                  const isDanger = pct >= threshold;

                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-background-light/30">
                      <td className="py-3 px-4 font-medium text-foreground">{p.sede?.nombre_sede || 'General'}</td>
                      <td className="py-3 px-4 text-right">
                        {editingId === p.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-muted">$</span>
                            <input
                              type="number"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSavePresupuesto(p.id); if (e.key === 'Escape') { setEditingId(null); setEditValue(''); } }}
                              autoFocus
                              className="w-28 px-2 py-1 text-sm text-right border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <button
                              onClick={() => handleSavePresupuesto(p.id)}
                              disabled={savingId === p.id}
                              className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                            >
                              {savingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {saveSuccess === p.id && <Check className="w-3.5 h-3.5 text-success" />}
                            <span className="text-muted">{formatCOP(p.monto_inicial)}</span>
                            {canEditBudget && (
                              <button
                                onClick={() => { setEditingId(p.id); setEditValue(String(p.monto_inicial)); }}
                                className="p-1 text-slate-300 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                title="Editar presupuesto"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-medium">{formatCOP(p.monto_consumido)}</td>
                      <td className="py-3 px-4 text-right font-medium">{formatCOP(p.monto_disponible)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-background-light rounded-full h-2">
                            <div
                              className={cn('h-2 rounded-full transition-all', barColor)}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isDanger ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-danger/10 text-danger">
                            <AlertTriangle className="w-3 h-3" /> Crítico
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">
                            <AlertTriangle className="w-3 h-3" /> Alerta
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                            Normal
                          </span>
                        )}
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
