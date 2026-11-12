'use client';

import { useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Download, X } from 'lucide-react';
import { readViewAsUiCookie } from '@/lib/auth/viewAs';
import {
  canPromptInstall, INSTALL_DISMISS_KEY, isInstallSnoozed, isIosDevice, isMobileDevice, isStandaloneDisplay,
  promptInstall, subscribeInstallAvailability,
} from '@/lib/pwa/install';

const subscribeNoop = () => () => {};

function deviceKey(): string {
  const { userAgent, platform, maxTouchPoints } = navigator;
  let snoozed = false;
  try {
    snoozed = isInstallSnoozed(localStorage.getItem(INSTALL_DISMISS_KEY), Date.now());
  } catch {
    snoozed = false;
  }
  return [
    isIosDevice(userAgent, platform, maxTouchPoints), isMobileDevice(userAgent, platform, maxTouchPoints),
    isStandaloneDisplay(), snoozed, Boolean(readViewAsUiCookie(document.cookie)),
  ].map(Number).join('');
}

/** Sugerencia de instalación en celular y computador: botón cuando el navegador lo permite; instrucciones en iPhone/iPad. */
export default function InstallPrompt() {
  const key = useSyncExternalStore(subscribeNoop, deviceKey, () => '');
  const canInstall = useSyncExternalStore(subscribeInstallAvailability, canPromptInstall, () => false);
  const [hidden, setHidden] = useState(false);
  // En la guía de instalación el aviso sobra: la página ya explica cómo instalar.
  const onInstallGuide = usePathname() === '/instalar';
  const [busy, setBusy] = useState(false);
  if (!key || hidden || onInstallGuide) return null;
  const [ios, mobile, standalone, snoozed, viewAs] = key.split('').map(value => value === '1');
  if (standalone || snoozed || viewAs || (!ios && !canInstall)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento disponible: se oculta solo en esta visita.
    }
    setHidden(true);
  };
  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await promptInstall() === 'accepted') setHidden(true);
    } catch (error) {
      console.error('[pwa] No se pudo iniciar la instalación:', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-labelledby="pwa-instalar-titulo" className="fixed inset-x-3 bottom-[calc(0.75rem+var(--mobile-nav-offset,env(safe-area-inset-bottom)))] z-[60] mx-auto max-w-md rounded-2xl border border-border bg-white p-4 shadow-xl sm:inset-x-auto sm:bottom-[calc(1.5rem+var(--mobile-nav-offset,0px))] sm:right-6 sm:mx-0 sm:max-w-sm">
      <div className="flex items-start gap-3">
        <Image src="/pwa/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="pwa-instalar-titulo" className="font-semibold text-foreground">{mobile ? 'Instala Imprima en tu celular' : 'Instala Imprima en tu computador'}</p>
          <p className="mt-1 text-sm text-muted">
            {ios
              ? <>Toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong>. Así podrás recibir avisos de tus pedidos. <Link href="/instalar" className="font-medium text-[#5c7004] underline underline-offset-2">Ver la guía paso a paso</Link></>
              : mobile
                ? 'Ábrela como app desde tu pantalla de inicio y recibe avisos de tus pedidos.'
                : 'Ábrela como aplicación en su propia ventana y recibe avisos de tus pedidos.'}
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Cerrar sugerencia de instalación" className="rounded-lg p-2 text-muted hover:bg-background-light focus-visible:outline-2 focus-visible:outline-primary">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="min-h-11 rounded-lg px-4 text-sm font-medium text-muted hover:bg-background-light focus-visible:outline-2 focus-visible:outline-primary">Ahora no</button>
        {!ios && (
          <button type="button" onClick={install} aria-disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-slate-950 hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 aria-disabled:opacity-60">
            <Download className="h-4 w-4" aria-hidden="true" />Instalar
          </button>
        )}
      </div>
    </aside>
  );
}
