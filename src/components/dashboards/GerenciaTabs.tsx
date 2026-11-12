'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { userHasAnyRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Resumen', href: '/dashboard' },
  { label: 'Rentabilidad', href: '/dashboard/gerencia' },
  { label: 'Cartera', href: '/dashboard/cartera' },
  { label: 'Comisiones', href: '/dashboard/comisiones' },
] as const;

/** Secciones de Gerencia (propuesta de escritorio): navegación entre páginas, solo para Dirección y Super Admin. */
export default function GerenciaTabs() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user || !userHasAnyRole(user, ['direccion', 'super_admin'])) return null;
  return (
    <nav aria-label="Secciones de gerencia" className="-mx-1 overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1 px-1">
        {TABS.map(tab => {
          const active = tab.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  active ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
