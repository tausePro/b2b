export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';
type DeferredInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type NavigatorWithInstall = Navigator & { install?: () => Promise<void>; standalone?: boolean };

export const INSTALL_DISMISS_KEY = 'imprima-pwa-instalar-descartado';
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

let deferredPrompt: DeferredInstallPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

// Se registra al cargar el módulo: el navegador emite beforeinstallprompt una sola vez y puede hacerlo antes de hidratar.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as DeferredInstallPrompt;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export function subscribeInstallAvailability(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function supportsWebInstall(): boolean {
  return typeof window !== 'undefined' && typeof (navigator as NavigatorWithInstall).install === 'function';
}

export function canPromptInstall(): boolean {
  return supportsWebInstall() || deferredPrompt !== null;
}

/** Debe llamarse directamente desde el clic para conservar la activación del usuario. */
export async function promptInstall(): Promise<InstallOutcome> {
  if (supportsWebInstall()) {
    try {
      await (navigator as NavigatorWithInstall).install!();
      return 'accepted';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';
      throw error;
    }
  }
  if (!deferredPrompt) return 'unavailable';
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  emit();
  await promptEvent.prompt();
  return (await promptEvent.userChoice).outcome;
}

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isMobileDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return isIosDevice(userAgent, platform, maxTouchPoints) || /Android|Mobile/i.test(userAgent);
}

export function isStandaloneDisplay(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as NavigatorWithInstall).standalone === true;
}

export function isInstallSnoozed(dismissedAt: string | null, now: number): boolean {
  const value = dismissedAt === null ? NaN : Number(dismissedAt);
  return Number.isFinite(value) && value <= now && now - value < INSTALL_SNOOZE_MS;
}
