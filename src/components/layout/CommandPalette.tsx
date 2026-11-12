'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { buildMenuGroups } from '@/lib/navigation/menu';
import { matchMenuItems, MIN_SEARCH_LENGTH, type PortalSearchResponse } from '@/lib/busqueda/buscar';
import { useLightDismiss } from '@/lib/ui/useLightDismiss';

type Option = { id: string; group: string; title: string; subtitle: string | null; href: string };
/** Evento para abrir el buscador desde otros controles (por ejemplo, el ícono de búsqueda del celular). */
export const OPEN_SEARCH_EVENT = 'imprima:abrir-buscador';
const subscribeNoop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const DIALOG_ATTRS = { closedby: 'any' } as Record<string, string>;

/** Buscador global (⌘K / Ctrl K): opciones del menú, pedidos, clientes y productos según el rol. */
export default function CommandPalette() {
  const { user } = useAuth();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<{ query: string; data: PortalSearchResponse | null; error: string | null } | null>(null);
  const [active, setActive] = useState(0);
  const shortcut = useSyncExternalStore(subscribeNoop, () => (isMac() ? '⌘K' : 'Ctrl K'), () => 'Ctrl K');
  const roles = useMemo(() => (user ? [user.rol, ...(user.rolesExtra ?? [])] : []), [user]);
  const menuGroups = useMemo(() => buildMenuGroups(roles), [roles]);

  const open = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    inputRef.current?.focus();
  };

  useLightDismiss(dialogRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else open();
      }
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, open);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => { setQuery(''); setDebounced(''); setActive(0); };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debounced.length < MIN_SEARCH_LENGTH) return;
    const controller = new AbortController();
    fetch(`/api/buscar?${new URLSearchParams({ q: debounced })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? 'No se pudo buscar.');
        setResults({ query: debounced, data: payload as PortalSearchResponse, error: null });
      })
      .catch(error => { if (!controller.signal.aborted) setResults({ query: debounced, data: null, error: error instanceof Error ? error.message : 'No se pudo buscar.' }); });
    return () => controller.abort();
  }, [debounced]);

  const current = debounced.length >= MIN_SEARCH_LENGTH && results?.query === debounced ? results : null;
  const loading = debounced.length >= MIN_SEARCH_LENGTH && !current;
  const options: Option[] = [
    ...matchMenuItems(menuGroups, query, query.trim() ? 6 : 8).map(entry => ({ id: `ir-${entry.href}`, group: 'Ir a', title: entry.label, subtitle: entry.group, href: entry.href })),
    ...([['pedidos', 'Pedidos'], ['clientes', 'Clientes del portal'], ['clientesOdoo', 'Clientes en Odoo'], ['productos', 'Productos']] as const)
      .flatMap(([key, group]) => (current?.data?.[key] ?? []).map(hit => ({ id: `${hit.kind}-${hit.id}`, group, title: hit.title, subtitle: hit.subtitle, href: hit.href }))),
  ];
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const groups = options.reduce<{ group: string; items: { option: Option; index: number }[] }[]>((list, option, index) => {
    const last = list[list.length - 1];
    if (last?.group === option.group) last.items.push({ option, index });
    else list.push({ group: option.group, items: [{ option, index }] });
    return list;
  }, []);

  const go = (option: Option | undefined) => {
    if (!option) return;
    dialogRef.current?.close();
    router.push(option.href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length) setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      go(options[activeIndex]);
    }
  };

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="hidden md:flex w-full max-w-md items-center gap-2 rounded-lg bg-background-light px-3 py-2 text-left text-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">Buscar clientes, pedidos o productos…</span>
        <kbd className="rounded border border-border bg-white px-1.5 py-0.5 font-sans text-[11px] text-muted">{shortcut}</kbd>
      </button>

      <dialog
        ref={dialogRef}
        {...DIALOG_ATTRS}
        aria-label="Buscar en el portal"
        className="m-0 mx-auto mt-[10vh] w-[min(40rem,calc(100vw-2rem))] max-h-[75vh] overflow-hidden rounded-2xl border border-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-900/40"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-label="Buscar clientes, pedidos, productos u opciones del menú"
            placeholder="Buscar clientes, pedidos, productos u opciones…"
            value={query}
            maxLength={80}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onInputKeyDown}
            className="min-h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Buscando" />}
        </div>
        <div id={listId} role="listbox" aria-label="Resultados" className="max-h-[calc(75vh-3.5rem)] overflow-y-auto p-2">
          {groups.map(({ group, items }) => (
            <div key={group} role="group" aria-labelledby={`${listId}-${group}`}>
              <p id={`${listId}-${group}`} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{group}</p>
              {items.map(({ option, index }) => (
                <div
                  key={option.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onPointerMove={() => setActive(index)}
                  onClick={() => go(option)}
                  className={`cursor-pointer rounded-lg px-3 py-2 ${index === activeIndex ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                >
                  <p className="truncate text-sm font-medium">{option.title}</p>
                  {option.subtitle && <p className="truncate text-xs text-muted">{option.subtitle}</p>}
                </div>
              ))}
            </div>
          ))}
          {options.length === 0 && !loading && <p className="px-3 py-6 text-center text-sm text-muted">Sin resultados para “{query.trim()}”.</p>}
          {current?.error && <p role="alert" className="px-3 py-2 text-sm text-red-700">{current.error}</p>}
          {current?.data?.warnings.map(warning => <p key={warning} className="px-3 py-1 text-xs text-amber-800">{warning}</p>)}
          {query.trim().length > 0 && query.trim().length < MIN_SEARCH_LENGTH && <p className="px-3 py-2 text-xs text-muted">Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar pedidos, clientes y productos.</p>}
        </div>
      </dialog>
    </>
  );
}
