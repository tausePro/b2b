'use client';

import { useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';

type UnreadStore = { userId: string; count: number; listeners: Set<() => void>; stop: (() => void) | null };

// Una sola suscripción por usuario, compartida por el encabezado y el menú lateral.
const stores = new Map<string, UnreadStore>();

function start(store: UnreadStore) {
  const supabase = createClient();
  let active = true;
  const refresh = async () => {
    const { count, error } = await supabase
      .from('notificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', store.userId)
      .eq('leida', false);
    if (!active) return;
    if (error) console.warn('Error cargando contador de notificaciones:', error);
    const next = error ? 0 : count ?? 0;
    if (next !== store.count) {
      store.count = next;
      store.listeners.forEach(listener => listener());
    }
  };
  void refresh();
  const channel = supabase
    .channel(`notificaciones-sin-leer-${store.userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${store.userId}` }, () => { void refresh(); })
    .subscribe();
  // Respaldo: al volver a la pestaña y cada 30 s mientras esté visible.
  const refreshIfVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
  document.addEventListener('visibilitychange', refreshIfVisible);
  const interval = setInterval(refreshIfVisible, 30000);
  store.stop = () => {
    active = false;
    document.removeEventListener('visibilitychange', refreshIfVisible);
    clearInterval(interval);
    void supabase.removeChannel(channel);
  };
}

export function useUnreadNotifications(userId: string | null | undefined): number {
  return useSyncExternalStore(
    (listener) => {
      if (!userId) return () => {};
      let store = stores.get(userId);
      if (!store) {
        store = { userId, count: 0, listeners: new Set(), stop: null };
        stores.set(userId, store);
      }
      const current = store;
      current.listeners.add(listener);
      if (!current.stop) start(current);
      return () => {
        current.listeners.delete(listener);
        if (current.listeners.size === 0) {
          current.stop?.();
          current.stop = null;
          stores.delete(userId);
        }
      };
    },
    () => (userId ? stores.get(userId)?.count ?? 0 : 0),
    () => 0,
  );
}
