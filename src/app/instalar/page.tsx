'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Bell, CheckCircle2, Copy, Download, Monitor, MoreVertical, PlusSquare, Share, Share2, Smartphone } from 'lucide-react';
import PwaHead from '@/components/pwa/PwaHead';
import {
  canPromptInstall, isIosDevice, isStandaloneDisplay, promptInstall, subscribeInstallAvailability,
} from '@/lib/pwa/install';
import { cn } from '@/lib/utils';

type Platform = 'ios' | 'android' | 'desktop';
const subscribeNoop = () => () => {};

function environmentKey(): string {
  const { userAgent, platform, maxTouchPoints } = navigator;
  const device: Platform = isIosDevice(userAgent, platform, maxTouchPoints) ? 'ios' : /Android/i.test(userAgent) ? 'android' : 'desktop';
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\/|LinkedInApp|Twitter/i.test(userAgent);
  return `${device}|${Number(inApp)}|${Number(isStandaloneDisplay())}`;
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-[#5c7004]" aria-hidden="true">{number}</span>
      <span className="pt-0.5 text-[15px] leading-6 text-foreground">{children}</span>
    </li>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <strong className="inline-flex items-center gap-1 rounded-md bg-background-light px-1.5 py-0.5 font-semibold">{children}</strong>
);

/** Guía pública para instalar el portal como app (enlace para compartir con los usuarios). */
export default function InstalarPage() {
  const envKey = useSyncExternalStore(subscribeNoop, environmentKey, () => '');
  const canInstall = useSyncExternalStore(subscribeInstallAvailability, canPromptInstall, () => false);
  const [status, setStatus] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [device, inAppFlag, standaloneFlag] = envKey ? envKey.split('|') : ['', '0', '0'];
  const platform = (device || 'ios') as Platform;
  const inApp = inAppFlag === '1';
  const standalone = standaloneFlag === '1';
  // Valores solo del navegador: el servidor renderiza la versión sin ellos y React actualiza tras hidratar.
  const shareUrl = useSyncExternalStore(subscribeNoop, () => `${window.location.origin}/instalar`, () => '');
  const canShare = useSyncExternalStore(subscribeNoop, () => typeof navigator.share === 'function', () => false);

  const announce = (text: string) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatus(text);
    statusTimer.current = setTimeout(() => setStatus(''), 4000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      announce('Enlace copiado. Pégalo en WhatsApp o en un correo.');
    } catch {
      announce(`No se pudo copiar. El enlace es ${shareUrl}`);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Instalar Imprima B2B', text: 'Instala el portal Imprima B2B en tu celular:', url: shareUrl });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) await copy();
    }
  };
  const install = async () => {
    const outcome = await promptInstall().catch(() => 'unavailable' as const);
    announce(outcome === 'accepted' ? 'Imprima quedó instalada.' : outcome === 'dismissed' ? 'Instalación cancelada.' : 'Este navegador no permite instalar desde aquí; sigue los pasos.');
  };

  const sections: { id: Platform; title: string; icon: React.ReactNode; body: React.ReactNode }[] = [
    {
      id: 'ios', title: 'iPhone o iPad', icon: <Smartphone className="h-5 w-5" aria-hidden="true" />,
      body: <>
        {inApp && platform === 'ios' && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Estás viendo esta página dentro de otra app. Toca <Key>⋯</Key> o el ícono de la brújula y elige <Key>Abrir en Safari</Key>.
          </p>
        )}
        <ol className="space-y-3">
          <Step number={1}>Abre este enlace en <Key>Safari</Key>. Si llegó por WhatsApp o por correo, ábrelo primero en Safari.</Step>
          <Step number={2}>Toca el botón <Key><Share className="h-4 w-4" aria-hidden="true" />Compartir</Key>: en iPhone está en la barra inferior; en iPad, arriba a la derecha.</Step>
          <Step number={3}>Desliza hacia abajo y toca <Key><PlusSquare className="h-4 w-4" aria-hidden="true" />Agregar a pantalla de inicio</Key>.</Step>
          <Step number={4}>Toca <Key>Agregar</Key>. El ícono de Imprima aparecerá en tu pantalla de inicio.</Step>
          <Step number={5}>Abre Imprima desde ese ícono, inicia sesión y activa los avisos en <Key><Bell className="h-4 w-4" aria-hidden="true" />Mi Perfil</Key> › Aplicación y notificaciones.</Step>
        </ol>
        <p className="mt-4 text-sm text-muted">Las notificaciones en iPhone requieren iOS 16.4 o superior y que el portal esté instalado en la pantalla de inicio.</p>
      </>,
    },
    {
      id: 'android', title: 'Android', icon: <Smartphone className="h-5 w-5" aria-hidden="true" />,
      body: <ol className="space-y-3">
        <Step number={1}>Abre este enlace en <Key>Chrome</Key>.</Step>
        <Step number={2}>Toca el menú <Key><MoreVertical className="h-4 w-4" aria-hidden="true" /></Key> arriba a la derecha.</Step>
        <Step number={3}>Toca <Key>Instalar aplicación</Key> o <Key>Agregar a la pantalla principal</Key> y confirma.</Step>
        <Step number={4}>Abre Imprima desde el ícono, inicia sesión y activa los avisos en Mi Perfil.</Step>
      </ol>,
    },
    {
      id: 'desktop', title: 'Computador', icon: <Monitor className="h-5 w-5" aria-hidden="true" />,
      body: <ol className="space-y-3">
        <Step number={1}>Abre <Key>b2b.imprima.com.co</Key> en Chrome o Edge.</Step>
        <Step number={2}>Haz clic en el ícono de instalar de la barra de direcciones, o en el menú <Key><MoreVertical className="h-4 w-4" aria-hidden="true" /></Key> › <Key>Instalar Imprima B2B</Key>.</Step>
        <Step number={3}>Confirma con <Key>Instalar</Key>. Imprima se abrirá en su propia ventana.</Step>
      </ol>,
    },
  ];
  const ordered = [...sections].sort((a, b) => Number(b.id === platform) - Number(a.id === platform));

  return (
    <main className="min-h-screen bg-background-light px-4 py-8 sm:py-12">
      <PwaHead />
      <div className="mx-auto max-w-xl space-y-6">
        <header className="text-center">
          <Image src="/pwa/icon-192.png" alt="" width={72} height={72} className="mx-auto rounded-2xl shadow-sm" priority />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Instala Imprima B2B</h1>
          <p className="mt-2 text-muted">Abre el portal como una app desde tu pantalla de inicio y recibe avisos de tus pedidos y aprobaciones.</p>
        </header>

        {standalone && (
          <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />Ya estás usando Imprima como app.
          </p>
        )}

        {canInstall && !standalone && platform !== 'ios' && (
          <button type="button" onClick={install} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-slate-950 hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
            <Download className="h-5 w-5" aria-hidden="true" />Instalar ahora
          </button>
        )}

        {ordered.map((section, index) => (
          <section key={section.id} aria-labelledby={`instalar-${section.id}`} className={cn('rounded-2xl border bg-white p-5', index === 0 && envKey ? 'border-primary/40' : 'border-border')}>
            <h2 id={`instalar-${section.id}`} className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <span className="text-primary">{section.icon}</span>{section.title}
              {index === 0 && envKey && <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-[#5c7004]">Tu dispositivo</span>}
            </h2>
            {section.body}
          </section>
        ))}

        <section aria-labelledby="compartir-enlace" className="rounded-2xl border border-border bg-white p-5">
          <h2 id="compartir-enlace" className="text-lg font-semibold text-foreground">Comparte esta guía</h2>
          <p className="mt-1 break-all text-sm text-muted">{shareUrl || 'b2b.imprima.com.co/instalar'}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {canShare && (
              <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Share2 className="h-4 w-4" aria-hidden="true" />Compartir
              </button>
            )}
            <button type="button" onClick={copy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Copy className="h-4 w-4" aria-hidden="true" />Copiar enlace
            </button>
          </div>
          <p role="status" className="mt-3 min-h-5 text-sm text-[#5c7004]">{status}</p>
        </section>

        <p className="text-center text-sm">
          <Link href="/dashboard" className="font-medium text-[#5c7004] underline underline-offset-4">Ir al portal</Link>
        </p>
      </div>
    </main>
  );
}
