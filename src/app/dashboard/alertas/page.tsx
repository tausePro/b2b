'use client';

import { AlertTriangle, Bell, CheckCircle } from 'lucide-react';

const alertas = [
  { tipo: 'danger', titulo: 'Presupuesto crítico - Sede Medellín', desc: 'Ha alcanzado el 92% del presupuesto mensual', fecha: 'Hace 2 horas' },
  { tipo: 'danger', titulo: 'Pedido PED-2025-0034 retrasado', desc: 'Lleva 48 horas sin aprobación', fecha: 'Hace 4 horas' },
  { tipo: 'warning', titulo: 'Error sincronización Odoo', desc: 'Fallo al sincronizar pedido PED-2025-0028', fecha: 'Hace 6 horas' },
  { tipo: 'warning', titulo: 'Presupuesto alerta - Sede Principal', desc: 'Ha alcanzado el 75% del presupuesto mensual', fecha: 'Hace 1 día' },
  { tipo: 'info', titulo: 'Nuevo asesor registrado', desc: 'Laura Torres se ha unido al equipo comercial', fecha: 'Hace 2 días' },
];

export default function AlertasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Centro de Alertas</h1>
        <p className="text-muted text-sm mt-1">Notificaciones y alertas del sistema</p>
      </div>

      <div className="space-y-3">
        {alertas.map((alerta, i) => (
          <div
            key={i}
            className={`bg-white rounded-xl border p-4 flex items-start gap-3 ${
              alerta.tipo === 'danger' ? 'border-danger/30' :
              alerta.tipo === 'warning' ? 'border-warning/30' : 'border-border'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              alerta.tipo === 'danger' ? 'bg-danger/10' :
              alerta.tipo === 'warning' ? 'bg-warning/10' : 'bg-info/10'
            }`}>
              {alerta.tipo === 'danger' ? <AlertTriangle className="w-4 h-4 text-danger" /> :
               alerta.tipo === 'warning' ? <Bell className="w-4 h-4 text-warning" /> :
               <CheckCircle className="w-4 h-4 text-info" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{alerta.titulo}</p>
              <p className="text-xs text-muted mt-0.5">{alerta.desc}</p>
            </div>
            <span className="text-xs text-muted whitespace-nowrap">{alerta.fecha}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
