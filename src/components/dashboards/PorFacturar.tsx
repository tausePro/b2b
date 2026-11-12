'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import PedidosPorFacturar from '@/components/dashboards/PedidosPorFacturar';
import type { ExecutiveSummary } from '@/lib/gerencia/resumen';
import { formatDateTimeBogota, formatMoney, formatMoneyShort, toDisplayName } from '@/lib/gerencia/formato';

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });

/** Pedidos confirmados con saldo por facturar (todos, con filtros) y facturas en borrador. */
export default function PorFacturar({ initialFilter = 'todos' }: { initialFilter?: 'todos' | 'antiguos' }) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ key: number; data: ExecutiveSummary | null; error: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/gerencia/resumen', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? 'No se pudo consultar Odoo.');
        setState({ key: refresh, data: payload as ExecutiveSummary, error: null });
      })
      .catch(error => { if (!controller.signal.aborted) setState({ key: refresh, data: null, error: error instanceof Error ? error.message : 'No se pudo consultar Odoo.' }); });
    return () => controller.abort();
  }, [refresh]);

  const current = state?.key === refresh ? state : null;
  const data = current?.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Por facturar</h1>
          <p className="mt-1 text-sm text-muted">{data
            ? `${data.toInvoice.orderCount} pedidos · ${formatMoneyShort(data.toInvoice.untaxed)} sin IVA · Odoo, actualizado ${formatDateTimeBogota(data.generatedAt)}`
            : 'Pedidos confirmados en Odoo con saldo pendiente por facturar.'}</p>
        </div>
        <button type="button" onClick={() => setRefresh(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar
        </button>
      </div>
      {!current && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando Odoo…</p>}
      {current?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{current.error}</p>}
      {data && <>
        <section aria-label="Pedidos por facturar">
          <PedidosPorFacturar orders={data.toInvoice.orders} filters framed initialFilter={initialFilter} />
        </section>
        <section id="borradores" aria-labelledby="borradores-titulo" className="scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-white">
          <h2 id="borradores-titulo" className="px-5 py-4 font-semibold">Facturas en borrador · {data.drafts.count} documentos ({formatMoneyShort(data.drafts.untaxed)} sin IVA)</h2>
          <ul className="divide-y divide-border border-t border-border">
            {data.drafts.items.map(draft => (
              <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{draft.name} · {draft.documentType === 'out_refund' ? 'Nota crédito' : 'Factura'}</p>
                  <p className="truncate text-muted">{draft.partnerName}{draft.advisorName ? ` · ${toDisplayName(draft.advisorName)}` : ''}{draft.date ? ` · ${dateFormatter.format(new Date(`${draft.date}T00:00:00Z`))}` : ''}</p>
                </div>
                <p className="font-semibold tabular-nums">{formatMoney(draft.untaxed)}</p>
              </li>
            ))}
            {data.drafts.items.length === 0 && <li className="px-5 py-4 text-sm text-muted">No hay facturas en borrador.</li>}
          </ul>
        </section>
      </>}
    </div>
  );
}
