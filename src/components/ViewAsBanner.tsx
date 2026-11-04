'use client';

import { useState, useSyncExternalStore } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { readViewAsUiCookie, VIEW_AS_EXIT_PATH } from '@/lib/auth/viewAs';

const subscribe = () => () => {};

export default function ViewAsBanner() {
  const name = useSyncExternalStore(subscribe, () => readViewAsUiCookie(document.cookie), () => null);
  const [leaving, setLeaving] = useState(false);
  if (!name) return null;
  const exit = async () => {
    setLeaving(true);
    const response = await fetch(VIEW_AS_EXIT_PATH, { method: 'POST' }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) as { redirect?: string } | null : null;
    window.location.href = payload?.redirect ?? '/login';
  };
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 shadow-lg">
      <Eye aria-hidden="true" className="h-4 w-4" />
      <span>Viendo como <strong>{name}</strong> · solo lectura</span>
      <button type="button" onClick={exit} disabled={leaving} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-60">
        {leaving && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}Salir
      </button>
    </div>
  );
}
