'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Eye, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type Candidate = { id: string; nombre: string; email: string; rol: string; empresa: string | null };

const ROLE_LABELS: Record<string, string> = {
  comprador: 'Comprador', aprobador: 'Aprobador', asesor: 'Asesor', direccion: 'Dirección', editor_contenido: 'Editor de contenido',
};
const subscribe = () => () => {};

export default function VerComoPage() {
  const { user } = useAuth();
  const expired = useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get('expirado') === '1', () => false);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<{ search: string; users: Candidate[]; error: string | null } | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const isSuperAdmin = user?.rol === 'super_admin';

  useEffect(() => {
    if (!isSuperAdmin) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/admin/ver-como?${new URLSearchParams({ buscar: search })}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null) as { usuarios?: Candidate[]; error?: string } | null;
        if (!response.ok || !Array.isArray(payload?.usuarios)) throw new Error(payload?.error ?? 'No se pudieron consultar los usuarios.');
        setResult({ search, users: payload.usuarios, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ search, users: [], error: error instanceof Error ? error.message : 'No se pudieron consultar los usuarios.' });
      }
    };
    void load();
    return () => controller.abort();
  }, [isSuperAdmin, search]);

  const start = async (candidate: Candidate) => {
    setStarting(candidate.id);
    setStartError(null);
    const response = await fetch('/api/admin/ver-como', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario_id: candidate.id }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) as { redirect?: string; error?: string } | null : null;
    if (response?.ok && payload?.redirect) {
      window.location.href = payload.redirect;
      return;
    }
    setStartError(payload?.error ?? 'No se pudo abrir la vista del usuario.');
    setStarting(null);
  };

  if (!isSuperAdmin) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6"><h1 className="text-xl font-semibold text-red-700">Acceso no permitido</h1><p className="mt-2 text-sm text-slate-600">Solo Super Admin puede ver el portal como otro usuario.</p></div>;
  }
  const current = result?.search === search ? result : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Ver como usuario</h1>
        <p className="mt-1 text-sm text-slate-600">Abre el portal tal como lo ve otra persona: su menú, sus permisos y sus datos. Es solo lectura, cada uso queda registrado y la vista vence a las 8 horas. Para volver a tu sesión usa el botón Salir del aviso inferior.</p>
      </header>
      {expired && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">La vista anterior venció y volviste a tu sesión de Super Admin.</p>}
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); }}>
        <label className="min-w-64 flex-1 text-sm font-medium text-slate-700">Nombre o correo
          <input type="search" value={draft} maxLength={80} onChange={(event) => setDraft(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Search aria-hidden="true" className="h-4 w-4" />Buscar</button>
      </form>
      {(current?.error || startError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{startError ?? current?.error}</p>}
      {!current && <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Consultando usuarios…</div>}
      {current && !current.error && (
        <div className="overflow-x-auto rounded-xl border border-border bg-white" role="region" aria-label="Usuarios disponibles para ver como" tabIndex={0}>
          <table className="w-full text-sm">
            <caption className="sr-only">Usuarios activos con acceso al portal. Se muestran hasta 50 resultados.</caption>
            <thead><tr className="border-b border-border bg-slate-50 text-left text-slate-500"><th scope="col" className="px-4 py-3 font-medium">Usuario</th><th scope="col" className="px-4 py-3 font-medium">Rol</th><th scope="col" className="px-4 py-3 font-medium">Empresa</th><th scope="col" className="px-4 py-3"><span className="sr-only">Acción</span></th></tr></thead>
            <tbody>{current.users.map(candidate => (
              <tr key={candidate.id} className="border-b border-border/50">
                <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">{candidate.nombre}<span className="mt-1 block text-xs font-normal text-slate-500">{candidate.email}</span></th>
                <td className="px-4 py-3">{ROLE_LABELS[candidate.rol] ?? candidate.rol}</td>
                <td className="px-4 py-3">{candidate.empresa ?? '—'}</td>
                <td className="px-4 py-3 text-right"><button type="button" disabled={starting !== null} onClick={() => start(candidate)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50">{starting === candidate.id ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Eye aria-hidden="true" className="h-4 w-4" />}Ver como</button></td>
              </tr>
            ))}</tbody>
          </table>
          {current.users.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No hay usuarios activos que coincidan con la búsqueda.</p>}
        </div>
      )}
    </div>
  );
}
