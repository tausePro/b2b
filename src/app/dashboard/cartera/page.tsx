'use client';

import { Wallet } from 'lucide-react';
import DashboardCartera from '@/components/dashboards/DashboardCartera';
import GerenciaTabs from '@/components/dashboards/GerenciaTabs';
import { OpenBalances } from '@/components/dashboards/GerenciaFinanzas';
import { useAuth } from '@/contexts/AuthContext';
import { userHasAnyRole } from '@/lib/auth/roles';
import { getBogotaCalendarDate } from '@/lib/comisiones/bonoPlataforma';

export default function CarteraPage() {
  const { user } = useAuth();
  if (!user) return null;
  const fullAccess = userHasAnyRole(user, ['direccion', 'super_admin']);
  return (
    <div className="space-y-6">
      <GerenciaTabs />
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Wallet className="h-6 w-6 text-primary" aria-hidden="true" />Cartera</h1>
        <p className="mt-1 text-sm text-muted">{fullAccess
          ? 'Cuentas por cobrar y por pagar de Odoo, con antigüedad y detalle por documento.'
          : 'Cuentas por cobrar de Odoo: facturas pendientes, vencidos por antigüedad y detalle por cliente.'}</p>
      </header>
      {fullAccess && <DashboardCartera embedded />}
      <OpenBalances key={getBogotaCalendarDate()} userId={user.id} refresh={0} receivableOnly={!fullAccess} />
    </div>
  );
}
