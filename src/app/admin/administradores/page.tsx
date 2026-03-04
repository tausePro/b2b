'use client';

import { Users } from 'lucide-react';

export default function AdministradoresPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Administradores</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gestión de usuarios con rol administrativo en Imprima.</p>
      </div>
      <div className="bg-white border border-border rounded-xl p-12 text-center shadow-sm">
        <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-base font-semibold text-slate-900 mb-1">Próximamente</h3>
        <p className="text-sm text-slate-500">La gestión de administradores estará disponible pronto.</p>
      </div>
    </div>
  );
}
