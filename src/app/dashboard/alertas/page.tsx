'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import type { NivelNotificacion, NotificacionApp } from '@/types';

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Hace unos segundos';
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays} día${diffDays === 1 ? '' : 's'}`;

  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getNivelStyles(nivel: NivelNotificacion) {
  switch (nivel) {
    case 'danger':
      return {
        container: 'border-danger/30 bg-danger/5',
        icon: 'bg-danger/10 text-danger',
      };
    case 'warning':
      return {
        container: 'border-warning/30 bg-warning/5',
        icon: 'bg-warning/10 text-warning',
      };
    case 'success':
      return {
        container: 'border-success/30 bg-success/5',
        icon: 'bg-success/10 text-success',
      };
    default:
      return {
        container: 'border-border bg-white',
        icon: 'bg-info/10 text-info',
      };
  }
}

export default function AlertasPage() {
  const { user } = useAuth();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'no_leidas'>('todas');
  const [notificaciones, setNotificaciones] = useState<NotificacionApp[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    const fetchNotificaciones = async (showLoader = false) => {
      if (showLoader && active) {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false });

      if (!active) return;

      if (error) {
        console.error('Error cargando notificaciones:', error);
        setErrorMessage('No fue posible cargar las notificaciones.');
        setNotificaciones([]);
        setLoading(false);
        return;
      }

      setNotificaciones((data as NotificacionApp[]) ?? []);
      setErrorMessage(null);
      setLoading(false);
    };

    void fetchNotificaciones(true);

    const channel = supabase
      .channel(`notificaciones-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${user.id}`,
        },
        () => {
          void fetchNotificaciones();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  const unreadCount = useMemo(
    () => notificaciones.filter((item) => !item.leida).length,
    [notificaciones]
  );

  const filtered = useMemo(() => {
    if (filter === 'no_leidas') {
      return notificaciones.filter((item) => !item.leida);
    }

    return notificaciones;
  }, [filter, notificaciones]);

  const markAsRead = async (notificacionId: string) => {
    if (!user) return;

    const current = notificaciones.find((item) => item.id === notificacionId);
    if (!current || current.leida) return;

    setUpdatingId(notificacionId);
    const leidaAt = new Date().toISOString();

    const { error } = await supabase
      .from('notificaciones')
      .update({
        leida: true,
        leida_at: leidaAt,
      })
      .eq('id', notificacionId)
      .eq('usuario_id', user.id);

    if (error) {
      console.error('Error marcando notificación como leída:', error);
      setUpdatingId(null);
      return;
    }

    setNotificaciones((prev) =>
      prev.map((item) =>
        item.id === notificacionId
          ? { ...item, leida: true, leida_at: leidaAt }
          : item
      )
    );
    setUpdatingId(null);
  };

  const markAllAsRead = async () => {
    if (!user || unreadCount === 0) return;

    setMarkingAll(true);
    const leidaAt = new Date().toISOString();

    const { error } = await supabase
      .from('notificaciones')
      .update({
        leida: true,
        leida_at: leidaAt,
      })
      .eq('usuario_id', user.id)
      .eq('leida', false);

    if (error) {
      console.error('Error marcando todas las notificaciones como leídas:', error);
      setMarkingAll(false);
      return;
    }

    setNotificaciones((prev) =>
      prev.map((item) => ({
        ...item,
        leida: true,
        leida_at: item.leida_at ?? leidaAt,
      }))
    );
    setMarkingAll(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centro de Alertas</h1>
          <p className="text-muted text-sm mt-1">Notificaciones dentro de la plataforma</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-background-light p-1">
            <button
              onClick={() => setFilter('todas')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'todas' ? 'bg-white text-foreground shadow-sm' : 'text-muted hover:text-foreground'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilter('no_leidas')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'no_leidas' ? 'bg-white text-foreground shadow-sm' : 'text-muted hover:text-foreground'
              }`}
            >
              No leídas
            </button>
          </div>

          <button
            onClick={() => void markAllAsRead()}
            disabled={markingAll || unreadCount === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground hover:bg-background-light disabled:opacity-50"
          >
            {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Marcar todas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-sm text-muted">Total</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{notificaciones.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-sm text-muted">No leídas</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{unreadCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-sm text-muted">Leídas</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{notificaciones.length - unreadCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          <p className="mt-2 text-sm text-muted">Cargando notificaciones...</p>
        </div>
      ) : errorMessage ? (
        <div className="rounded-xl border border-danger/30 bg-white p-12 text-center">
          <Bell className="w-10 h-10 text-danger mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No pudimos cargar tus alertas</p>
          <p className="text-sm text-muted mt-1">{errorMessage}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-12 text-center">
          <Bell className="w-10 h-10 text-border mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No tienes notificaciones</p>
          <p className="text-sm text-muted mt-1">
            {filter === 'no_leidas'
              ? 'Ya revisaste todas las alertas pendientes.'
              : 'Cuando haya actividad relevante en tus pedidos, aparecerá aquí.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((notificacion) => {
            const styles = getNivelStyles(notificacion.nivel);

            return (
              <div
                key={notificacion.id}
                className={`rounded-xl border p-4 transition-colors ${styles.container} ${
                  notificacion.leida ? 'opacity-80' : ''
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.icon}`}>
                    <Bell className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{notificacion.titulo}</p>
                          {!notificacion.leida && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              Nueva
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted">{notificacion.descripcion}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{formatRelativeTime(notificacion.created_at)}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!notificacion.leida && (
                        <button
                          onClick={() => void markAsRead(notificacion.id)}
                          disabled={updatingId === notificacion.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background-light disabled:opacity-50"
                        >
                          {updatingId === notificacion.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Marcar leída
                        </button>
                      )}

                      {notificacion.ruta && (
                        <Link
                          href={notificacion.ruta}
                          onClick={() => {
                            if (!notificacion.leida) {
                              void markAsRead(notificacion.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-white"
                        >
                          Ver detalle
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
