'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellOff, Download, Loader2, Send, Smartphone } from 'lucide-react';
import { urlBase64ToUint8Array } from '@/lib/push/shared';
import { canPromptInstall, promptInstall, subscribeInstallAvailability } from '@/lib/pwa/install';

type ServerStatus = { configured: boolean; publicKey: string | null };
type Message = { tone: 'ok' | 'error'; text: string };

const subscribeNoop = () => () => {};
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';

function environmentKey(): string {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  return `${Number(ios)}${Number(standalone)}${Number(supported)}`;
}

async function readJson(response: Response) {
  return await response.json().catch(() => null) as { error?: string | null } | null;
}

export default function PushSettings() {
  const envKey = useSyncExternalStore(subscribeNoop, environmentKey, () => '');
  const env = envKey ? { ios: envKey[0] === '1', standalone: envKey[1] === '1', supported: envKey[2] === '1' } : null;
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(() => (typeof Notification === 'undefined' ? null : Notification.permission));
  const [subscribed, setSubscribed] = useState(false);
  const canInstall = useSyncExternalStore(subscribeInstallAvailability, canPromptInstall, () => false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    fetch('/api/push/suscripcion', { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
      .then(data => setStatus(data ? { configured: Boolean(data.configured), publicKey: data.publicKey ?? null } : { configured: false, publicKey: null }))
      .catch(() => setStatus({ configured: false, publicKey: null }));
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription()).then(subscription => setSubscribed(Boolean(subscription))).catch(() => undefined);
    }
  }, []);

  const run = async (name: string, action: () => Promise<string>) => {
    setBusy(name);
    setMessage(null);
    try {
      setMessage({ tone: 'ok', text: await action() });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo completar la acción.' });
    } finally {
      setBusy(null);
    }
  };

  const activate = () => run('activar', async () => {
    if (!status?.configured || !status.publicKey) throw new Error('Las notificaciones aún no están configuradas en el servidor.');
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') throw new Error('No se concedió el permiso de notificaciones en este dispositivo.');
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.publicKey) });
    const response = await fetch('/api/push/suscripcion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!response.ok) throw new Error((await readJson(response))?.error ?? 'No se pudo activar en este dispositivo.');
    setSubscribed(true);
    return 'Notificaciones activadas en este dispositivo.';
  });

  const deactivate = () => run('desactivar', async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch('/api/push/suscripcion', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) });
    }
    setSubscribed(false);
    return 'Notificaciones desactivadas en este dispositivo.';
  });

  const sendTest = () => run('prueba', async () => {
    const response = await fetch('/api/push/prueba', { method: 'POST' });
    if (!response.ok) throw new Error((await readJson(response))?.error ?? 'No se pudo enviar la prueba.');
    return 'Te enviamos una notificación de prueba. Si no aparece, revisa los permisos del navegador o del sistema.';
  });

  const install = () => run('instalar', async () => {
    const outcome = await promptInstall();
    if (outcome === 'unavailable') throw new Error('La instalación no está disponible en este navegador.');
    return outcome === 'accepted' ? 'Imprima quedó instalada en este dispositivo.' : 'Instalación cancelada.';
  });

  const iosNeedsInstall = Boolean(env?.ios && !env.standalone);
  const canActivate = Boolean(env?.supported && status?.configured && permission !== 'denied' && busy === null);

  return (
    <section aria-labelledby="pwa-titulo" className="space-y-4 rounded-xl border border-border bg-white p-6">
      <div>
        <h2 id="pwa-titulo" className="flex items-center gap-2 text-lg font-semibold text-foreground"><Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />Aplicación y notificaciones</h2>
        <p className="mt-1 text-sm text-muted">Instala el portal en tu celular o computador y recibe avisos de pedidos por aprobar, aprobaciones, rechazos y novedades de tus clientes.</p>
      </div>
      {iosNeedsInstall && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">En iPhone o iPad: toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong>. Abre Imprima desde ese ícono y vuelve a esta sección para activar las notificaciones (requiere iOS 16.4 o superior).</p>}
      {env && !env.supported && !iosNeedsInstall && <p className="rounded-lg border border-border bg-background-light p-3 text-sm text-muted">Este navegador no admite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizado.</p>}
      {status && !status.configured && <p className="rounded-lg border border-border bg-background-light p-3 text-sm text-muted">Las notificaciones aún no están configuradas en el servidor.</p>}
      {permission === 'denied' && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Las notificaciones están bloqueadas para este sitio. Habilítalas en la configuración del navegador y vuelve a intentarlo.</p>}
      <div className="flex flex-wrap gap-3">
        {canInstall && !env?.standalone && <button type="button" className={button} onClick={install} disabled={busy !== null}><Download className="h-4 w-4" aria-hidden="true" />Instalar aplicación</button>}
        {subscribed
          ? <button type="button" className={button} onClick={deactivate} disabled={busy !== null}>{busy === 'desactivar' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}Desactivar en este dispositivo</button>
          : <button type="button" className={button} onClick={activate} disabled={!canActivate}>{busy === 'activar' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}Activar notificaciones</button>}
        <button type="button" className={button} onClick={sendTest} disabled={!subscribed || busy !== null}>{busy === 'prueba' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}Enviar prueba</button>
      </div>
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${message.tone === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>{message.text}</p>}
    </section>
  );
}
