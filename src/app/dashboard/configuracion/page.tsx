'use client';

import { Settings } from 'lucide-react';

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-muted text-sm mt-1">Ajustes generales de la plataforma</p>
      </div>
      <div className="bg-white rounded-xl border border-border p-12 text-center">
        <Settings className="w-10 h-10 text-border mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Configuración del Sistema</h2>
        <p className="text-sm text-muted">
          Gestión de usuarios, roles, integraciones y parámetros generales.
        </p>
      </div>
    </div>
  );
}
