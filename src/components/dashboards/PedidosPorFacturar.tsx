'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { STALE_ORDER_DAYS, type ExecutiveOrderToInvoice } from '@/lib/gerencia/resumen';
import type { OrderToInvoiceDetail } from '@/lib/gerencia/pedidoPorFacturar.server';
import { formatMoney, formatMoneyShort, shortPersonName, toDisplayName } from '@/lib/gerencia/formato';
import { cn } from '@/lib/utils';

type Filter = { kind: 'todos' } | { kind: 'antiguos' } | { kind: 'asesora'; name: string };

const quantity = (value: number) => value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
const dateOnly = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)) : '—');

/** Qué falta facturar de un pedido: líneas, entregas pendientes y facturas en borrador (consulta Odoo al abrirlo). */
function OrderDetail({ orderId }: { orderId: number }) {
  const [state, setState] = useState<{ data: OrderToInvoiceDetail | null; error: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/gerencia/pedido-por-facturar?id=${orderId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? 'No se pudo consultar el pedido.');
        setState({ data, error: null });
      })
      .catch((error) => { if (!controller.signal.aborted) setState({ data: null, error: error instanceof Error ? error.message : 'No se pudo consultar el pedido.' }); });
    return () => controller.abort();
  }, [orderId]);
  if (!state) return <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando el pedido en Odoo…</p>;
  if (!state.data) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  const detail = state.data;
  const drafts = detail.draftInvoices;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">Pedido del {dateOnly(detail.date)}{detail.clientRef ? ` · Ref. cliente ${detail.clientRef}` : ''} · Total del pedido {formatMoney(detail.amountUntaxed)} sin IVA</p>
      <ul className="flex flex-wrap gap-2 text-xs">
        <li className={cn('rounded-md px-2 py-1 font-medium', detail.pendingDeliveries ? 'bg-amber-50 text-amber-800' : 'bg-background-light text-muted')}>
          {detail.pendingDeliveries ? `${detail.pendingDeliveries} ${detail.pendingDeliveries === 1 ? 'entrega pendiente' : 'entregas pendientes'}` : 'Sin entregas pendientes'}
        </li>
        <li className={cn('rounded-md px-2 py-1 font-medium', drafts.length ? 'bg-amber-50 text-amber-800' : 'bg-background-light text-muted')}>
          {drafts.length ? `Factura en borrador: ${drafts.map((draft) => `${draft.name} (${formatMoney(draft.amount)})`).join(', ')}` : 'Sin facturas en borrador'}
        </li>
      </ul>
      <ul className="divide-y divide-border rounded-xl border border-border bg-white">
        {detail.lines.map((line) => (
          <li key={line.id} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="font-medium">{line.product}</p>
              <p className="text-xs text-muted">Pedido {quantity(line.ordered)} · Entregado {quantity(line.delivered)} · Facturado {quantity(line.invoiced)}</p>
            </div>
            <p className="text-sm sm:text-right"><span className="text-muted">Por facturar {quantity(line.toInvoice)} · </span><strong className="tabular-nums">{formatMoney(line.amountToInvoice)}</strong></p>
          </li>
        ))}
        {detail.lines.length === 0 && <li className="px-3 py-2.5 text-muted">Odoo no reporta líneas pendientes en este momento.</li>}
      </ul>
    </div>
  );
}

function AgeChip({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted">—</span>;
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums', days > STALE_ORDER_DAYS ? 'bg-amber-100 text-amber-800' : 'bg-background-light text-muted')}>
      {days} {days === 1 ? 'día' : 'días'}
    </span>
  );
}

/** Pedidos con saldo por facturar: tabla en escritorio y tarjetas en el celular; filtros opcionales en chips. */
export default function PedidosPorFacturar({ orders, limit, filters = false, framed = false, initialFilter = 'todos' }: {
  orders: readonly ExecutiveOrderToInvoice[];
  limit?: number;
  filters?: boolean;
  /** Enmarca la tabla de escritorio como tarjeta (cuando no va dentro de otra tarjeta). */
  framed?: boolean;
  initialFilter?: 'todos' | 'antiguos';
}) {
  const [filter, setFilter] = useState<Filter>({ kind: initialFilter });
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (id: number) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const advisors = [...new Set(orders.map(order => order.advisorName ?? 'Sin asesora'))].sort((a, b) => a.localeCompare(b, 'es'));
  const filtered = orders.filter(order => filter.kind === 'todos'
    || (filter.kind === 'antiguos' ? (order.ageDays ?? 0) > STALE_ORDER_DAYS : (order.advisorName ?? 'Sin asesora') === filter.name));
  const visible = limit ? filtered.slice(0, limit) : filtered;
  const total = filtered.reduce((sum, order) => sum + order.amountToInvoice, 0);
  const chips: { label: string; value: Filter }[] = [
    { label: 'Todos', value: { kind: 'todos' } },
    { label: `> ${STALE_ORDER_DAYS} días`, value: { kind: 'antiguos' } },
    ...advisors.map(name => ({ label: toDisplayName(name).split(' ')[0], value: { kind: 'asesora', name } as Filter })),
  ];
  const isActive = (value: Filter) => value.kind === filter.kind && (value.kind !== 'asesora' || (filter.kind === 'asesora' && filter.name === value.name));

  return (
    <div className="space-y-3">
      {filters && (
        <>
          <div role="group" aria-label="Filtrar pedidos" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {chips.map(chip => (
              <button
                key={chip.value.kind === 'asesora' ? `asesora-${chip.value.name}` : chip.value.kind}
                type="button"
                aria-pressed={isActive(chip.value)}
                title={chip.value.kind === 'asesora' ? toDisplayName(chip.value.name) : undefined}
                onClick={() => setFilter(chip.value)}
                className={cn('min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  isActive(chip.value) ? 'border-foreground bg-foreground text-white' : 'border-border bg-white text-foreground hover:bg-background-light')}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted" aria-live="polite">{filtered.length} pedidos · {formatMoneyShort(total)}</p>
        </>
      )}

      <ul className="space-y-3 md:hidden">
        {visible.map(order => (
          <li key={order.id} className="rounded-xl border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#5c7004]">{order.name}</span>
              <AgeChip days={order.ageDays} />
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{order.partnerName}</p>
                <p className="truncate text-sm text-muted">{order.advisorName ? shortPersonName(order.advisorName) : 'Sin asesora'}</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatMoneyShort(order.amountToInvoice)}</p>
            </div>
            <button type="button" aria-expanded={open.has(order.id)} aria-controls={`pedido-movil-${order.id}`} onClick={() => toggle(order.id)}
              className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-background-light">
              {open.has(order.id) ? 'Ocultar detalle' : 'Ver detalle'}<ChevronDown className={cn('h-4 w-4 transition-transform', open.has(order.id) && 'rotate-180')} aria-hidden="true" />
            </button>
            {open.has(order.id) && <div id={`pedido-movil-${order.id}`} className="mt-3"><OrderDetail orderId={order.id} /></div>}
          </li>
        ))}
      </ul>

      <div className={cn('hidden overflow-x-auto md:block', framed && 'rounded-2xl border border-border bg-white')}>
        <table className="w-full text-sm">
          <thead className="bg-background-light text-left text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Pedido</th>
              <th scope="col" className="px-5 py-3 font-medium">Cliente</th>
              <th scope="col" className="px-5 py-3 font-medium">Asesora</th>
              <th scope="col" className="px-5 py-3 font-medium">Antigüedad</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Saldo sin IVA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(order => (
              <Fragment key={order.id}>
                <tr className="border-t border-border">
                  <th scope="row" className="px-5 py-3 text-left font-semibold text-[#5c7004]">
                    <button type="button" aria-expanded={open.has(order.id)} aria-controls={`pedido-${order.id}`} onClick={() => toggle(order.id)}
                      className="inline-flex items-center gap-1 rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      title={open.has(order.id) ? 'Ocultar detalle' : 'Ver qué falta facturar'}>
                      {order.name}<ChevronDown className={cn('h-4 w-4 transition-transform', open.has(order.id) && 'rotate-180')} aria-hidden="true" />
                    </button>
                  </th>
                  <td className="px-5 py-3">{order.partnerName}</td>
                  <td className="px-5 py-3 text-muted">{order.advisorName ? toDisplayName(order.advisorName) : 'Sin asesora'}</td>
                  <td className="px-5 py-3"><AgeChip days={order.ageDays} /></td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatMoney(order.amountToInvoice)}</td>
                </tr>
                {open.has(order.id) && (
                  <tr id={`pedido-${order.id}`}>
                    <td colSpan={5} className="bg-background-light/50 px-5 py-4"><OrderDetail orderId={order.id} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="px-5 py-4 text-sm text-muted">No hay pedidos con este filtro.</p>}
    </div>
  );
}
