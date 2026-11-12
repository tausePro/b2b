'use client';

import { useState } from 'react';
import { STALE_ORDER_DAYS, type ExecutiveOrderToInvoice } from '@/lib/gerencia/resumen';
import { formatMoney, formatMoneyShort, shortPersonName, toDisplayName } from '@/lib/gerencia/formato';
import { cn } from '@/lib/utils';

type Filter = { kind: 'todos' } | { kind: 'antiguos' } | { kind: 'asesora'; name: string };

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
              <tr key={order.id} className="border-t border-border">
                <th scope="row" className="px-5 py-3 text-left font-semibold text-[#5c7004]">{order.name}</th>
                <td className="px-5 py-3">{order.partnerName}</td>
                <td className="px-5 py-3 text-muted">{order.advisorName ? toDisplayName(order.advisorName) : 'Sin asesora'}</td>
                <td className="px-5 py-3"><AgeChip days={order.ageDays} /></td>
                <td className="px-5 py-3 text-right tabular-nums">{formatMoney(order.amountToInvoice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="px-5 py-4 text-sm text-muted">No hay pedidos con este filtro.</p>}
    </div>
  );
}
