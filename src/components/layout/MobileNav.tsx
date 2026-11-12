'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, MoreHorizontal, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MENU_ICONS } from '@/components/layout/Sidebar';
import { buildMenuGroups, buildMobileDestinations, isMenuItemActive } from '@/lib/navigation/menu';
import { useLightDismiss } from '@/lib/ui/useLightDismiss';
import { ROLE_CONFIG } from '@/types';
import { cn } from '@/lib/utils';

const DIALOG_ATTRS = { closedby: 'any' } as Record<string, string>;

/** Celular y tableta (perfiles internos): barra inferior con 4 destinos y "Más" con el menú agrupado y el perfil. */
export default function MobileNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  useLightDismiss(sheet);

  // Reserva espacio para la barra (contenido y aviso de instalación) solo mientras existe.
  useEffect(() => {
    document.documentElement.dataset.mobileNav = 'true';
    return () => { delete document.documentElement.dataset.mobileNav; };
  }, []);

  if (!user) return null;
  const roles = [user.rol, ...(user.rolesExtra ?? [])];
  const destinations = buildMobileDestinations(roles);
  const groups = buildMenuGroups(roles)
    .map(group => ({ ...group, items: group.items.filter(entry => !destinations.some(destination => destination.href === entry.href)) }))
    .filter(group => group.items.length > 0);
  const moreActive = !destinations.some(destination => isMenuItemActive(pathname, destination.activePattern));
  const close = () => sheet.current?.close();

  return (
    <>
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {destinations.map(destination => {
            const active = isMenuItemActive(pathname, destination.activePattern);
            const Icon = MENU_ICONS[destination.icon];
            return (
              <li key={destination.href}>
                <Link href={destination.href} aria-current={active ? 'page' : undefined} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary">
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', active ? 'bg-primary/15 text-[#5c7004]' : 'text-muted')}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className={active ? 'text-foreground' : 'text-muted'}>{destination.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()} className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary">
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive ? 'bg-primary/15 text-[#5c7004]' : 'text-muted')}><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></span>
              <span className={moreActive ? 'text-foreground' : 'text-muted'}>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog ref={sheet} {...DIALOG_ATTRS} aria-labelledby="menu-mas-titulo" className="m-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white p-0 pb-[env(safe-area-inset-bottom)] text-foreground backdrop:bg-slate-900/40 lg:hidden">
        <div className="sticky top-0 flex items-center justify-between bg-white px-5 pb-2 pt-4">
          <h2 id="menu-mas-titulo" className="text-base font-semibold">Más opciones</h2>
          <button type="button" onClick={close} className="rounded-lg p-2 text-muted hover:bg-background-light focus-visible:outline-2 focus-visible:outline-primary" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <Link href="/dashboard/perfil" onClick={close} className="mx-4 flex items-center gap-3 rounded-2xl border border-border p-4 hover:bg-background-light focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-[#5c7004]" aria-hidden="true">{user.nombre?.[0]}{user.apellido?.[0]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{user.nombre} {user.apellido}</span>
            <span className="block truncate text-sm text-muted">{ROLE_CONFIG[user.rol].label} · Mi perfil y notificaciones</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
        </Link>
        <nav aria-label="Menú completo" className="space-y-4 px-4 py-4">
          {groups.map((group, index) => (
            <div key={group.label ?? `grupo-${index}`}>
              {group.label && <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.label}</h3>}
              <ul>
                {group.items.map(entry => {
                  const Icon = MENU_ICONS[entry.icon];
                  const active = isMenuItemActive(pathname, entry.activePattern);
                  return (
                    <li key={entry.href}>
                      <Link href={entry.href} onClick={close} aria-current={active ? 'page' : undefined} className={cn('flex min-h-12 items-center gap-3 rounded-xl px-2 text-[15px] focus-visible:outline-2 focus-visible:outline-primary', active ? 'bg-primary/10 font-medium text-foreground' : 'text-foreground hover:bg-background-light')}>
                        <Icon className="h-5 w-5 text-muted" aria-hidden="true" />{entry.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </dialog>
    </>
  );
}
