'use client';

import { Receipt } from 'lucide-react';

export default function PedidosAdminPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gestión y seguimiento de pedidos de todas las empresas.</p>
      </div>
      <div className="bg-white border border-border rounded-xl p-12 text-center shadow-sm">
        <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-base font-semibold text-slate-900 mb-1">Próximamente</h3>
        <p className="text-sm text-slate-500">La gestión de pedidos estará disponible pronto.</p>
      </div>
    </div>
  );
}
