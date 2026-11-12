'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Search, TrendingDown, Truck } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import type { PurchaseCostPoint, PurchaseHistoryReport, PurchaseSearchReport } from '@/lib/compras/historial';

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));
const cell = 'px-4 py-3 text-right tabular-nums align-top';
const heading = 'px-4 py-3 text-right font-medium text-muted';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';

type Loaded<T> = { key: string; data: T | null; error: string | null };

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? 'No se pudo consultar el historial de compras.');
  return payload as T;
}

function CostPoint({ point }: { point: PurchaseCostPoint | null }) {
  if (!point) return <span className="text-muted">Sin compras</span>;
  return <><span className="font-semibold">{money.format(point.unitCost)}</span><span className="mt-1 block text-xs text-muted">{point.supplierName} · {formatDate(point.date)}</span></>;
}

export default function ComprasProveedores({ initialProductId = null }: { initialProductId?: number | null }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState<number | null>(initialProductId);
  const [results, setResults] = useState<Loaded<PurchaseSearchReport> | null>(null);
  const [history, setHistory] = useState<Loaded<PurchaseHistoryReport> | null>(null);

  useEffect(() => {
    if (search.length < 2) return;
    const controller = new AbortController();
    fetchJson<PurchaseSearchReport>(`/api/compras/historial?${new URLSearchParams({ buscar: search })}`, controller.signal)
      .then(data => setResults({ key: search, data, error: null }))
      .catch(error => { if (!controller.signal.aborted) setResults({ key: search, data: null, error: error.message }); });
    return () => controller.abort();
  }, [search]);

  useEffect(() => {
    if (productId === null) return;
    const controller = new AbortController();
    fetchJson<PurchaseHistoryReport>(`/api/compras/historial?producto_id=${productId}`, controller.signal)
      .then(data => setHistory({ key: String(productId), data, error: null }))
      .catch(error => { if (!controller.signal.aborted) setHistory({ key: String(productId), data: null, error: error.message }); });
    return () => controller.abort();
  }, [productId]);

  const currentResults = results?.key === search ? results : null;
  const currentHistory = productId !== null && history?.key === String(productId) ? history : null;
  const detail = currentHistory?.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Truck className="h-6 w-6 text-primary" aria-hidden="true" />Compras con proveedores</h1>
        <p className="mt-1 text-sm text-muted">Historial de órdenes de compra confirmadas de los últimos 12 meses y el costo más bajo por producto, en COP sin IVA por unidad del producto.</p>
      </header>

      <form role="search" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4" onSubmit={(event) => { event.preventDefault(); setProductId(null); setSearch(draft.trim()); }}>
        <label className="min-w-64 flex-1 text-sm font-medium">Producto (nombre o referencia)
          <input type="search" value={draft} minLength={2} maxLength={80} required onChange={(event) => setDraft(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" className={button}><Search className="h-4 w-4" aria-hidden="true" />Buscar</button>
      </form>

      {productId === null && search.length >= 2 && !currentResults && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando órdenes de compra en Odoo…</p>}
      {productId === null && currentResults?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{currentResults.error}</p>}
      {productId === null && currentResults?.data && (
        <section aria-labelledby="compras-resultados" className="space-y-2">
          <div className="overflow-auto rounded-xl border border-border bg-white" style={{ maxBlockSize: 'min(640px, 75vh)' }} role="region" aria-labelledby="compras-resultados" tabIndex={0}>
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption id="compras-resultados" className="px-4 py-3 text-left font-semibold">Productos encontrados · desde {formatDate(currentResults.data.range.from)}</caption>
              <thead className="sticky top-0 z-10 bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Producto</th><th scope="col" className={heading}>Costo más bajo</th><th scope="col" className={heading}>Último costo</th><th scope="col" className={heading}>Costo promedio</th><th scope="col" className={heading}>Compras</th><th scope="col" className="px-4 py-3"><span className="sr-only">Acción</span></th></tr></thead>
              <tbody>{currentResults.data.products.map(product => (
                <tr key={product.id} className="border-t border-border">
                  <th scope="row" className="min-w-56 px-4 py-3 text-left align-top font-medium">{product.name}<span className="mt-1 block text-xs font-normal text-muted">Ref.: {product.sku ?? 'No disponible'} · {product.unitName}</span></th>
                  <td className={cell}><CostPoint point={product.summary.lowest} /></td>
                  <td className={cell}><CostPoint point={product.summary.last} /></td>
                  <td className={cell}>{product.summary.averageUnitCost === null ? '—' : money.format(product.summary.averageUnitCost)}</td>
                  <td className={cell}>{product.summary.purchaseCount}<span className="mt-1 block text-xs text-muted">{product.summary.supplierCount} proveedores</span></td>
                  <td className="px-4 py-3 text-right align-top"><button type="button" className={button} disabled={product.summary.purchaseCount === 0} onClick={() => setProductId(product.id)}>Ver historial</button></td>
                </tr>
              ))}</tbody>
            </table>
            {currentResults.data.products.length === 0 && <p className="px-4 pb-4 text-sm text-muted">No hay productos activos que coincidan con la búsqueda.</p>}
          </div>
          {currentResults.data.warnings.map(warning => <p key={warning} className="text-xs text-muted">{warning}</p>)}
        </section>
      )}

      {productId !== null && (
        <section aria-labelledby="compras-historial" className="space-y-4">
          <button type="button" className={button} onClick={() => setProductId(null)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver a los resultados</button>
          {!currentHistory && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando el historial del producto…</p>}
          {currentHistory?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{currentHistory.error}</p>}
          {detail && <>
            <h2 id="compras-historial" className="text-lg font-semibold">{detail.product.name}<span className="ml-2 text-sm font-normal text-muted">Ref.: {detail.product.sku ?? 'No disponible'} · por {detail.product.unitName}</span></h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <KpiCard title="Costo más bajo" value={detail.summary.lowest ? money.format(detail.summary.lowest.unitCost) : '—'} subtitle={detail.summary.lowest ? `${detail.summary.lowest.supplierName} · ${formatDate(detail.summary.lowest.date)} · ${detail.summary.lowest.orderName}` : 'Sin compras en el período'} icon={<TrendingDown className="h-5 w-5" aria-hidden="true" />} />
              <KpiCard title="Último costo" value={detail.summary.last ? money.format(detail.summary.last.unitCost) : '—'} subtitle={detail.summary.last ? `${detail.summary.last.supplierName} · ${formatDate(detail.summary.last.date)}` : 'Sin compras en el período'} icon={<Truck className="h-5 w-5" aria-hidden="true" />} />
              <KpiCard title="Costo promedio ponderado" value={detail.summary.averageUnitCost === null ? '—' : money.format(detail.summary.averageUnitCost)} subtitle={`${quantity.format(detail.summary.totalQuantity)} ${detail.product.unitName} compradas`} icon={<Truck className="h-5 w-5" aria-hidden="true" />} />
              <KpiCard title="Compras" value={String(detail.summary.purchaseCount)} subtitle={`${detail.summary.orderCount} órdenes · ${detail.summary.supplierCount} proveedores`} icon={<Truck className="h-5 w-5" aria-hidden="true" />} />
            </div>
            <div className="overflow-auto rounded-xl border border-border bg-white" style={{ maxBlockSize: 'min(640px, 75vh)' }} role="region" aria-labelledby="compras-detalle" tabIndex={0}>
              <table className="w-full border-separate border-spacing-0 text-sm">
                <caption id="compras-detalle" className="px-4 py-3 text-left font-semibold">Órdenes de compra · {formatDate(detail.range.from)} a {formatDate(detail.range.to)}</caption>
                <thead className="sticky top-0 z-10 bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Fecha</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Orden</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Proveedor</th><th scope="col" className={heading}>Cantidad</th><th scope="col" className={heading}>Costo unitario</th><th scope="col" className={heading}>Subtotal sin IVA</th></tr></thead>
                <tbody>{detail.lines.map(line => {
                  const lowest = detail.summary.lowest?.unitCost === line.unitCost;
                  return (
                    <tr key={line.id} className={lowest ? 'bg-emerald-50' : undefined}>
                      <td className="border-t border-border px-4 py-3 align-top">{formatDate(line.date)}</td>
                      <th scope="row" className="border-t border-border px-4 py-3 text-left align-top font-medium">{line.orderName}</th>
                      <td className="border-t border-border px-4 py-3 align-top">{line.supplierName}</td>
                      <td className={`${cell} border-t border-border`}>{quantity.format(line.quantity)} {line.unitName}</td>
                      <td className={`${cell} border-t border-border`}>{money.format(line.unitCost)}{lowest && <span className="mt-1 block text-xs font-semibold text-emerald-700">Costo más bajo</span>}</td>
                      <td className={`${cell} border-t border-border`}>{money.format(line.subtotal)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {detail.lines.length === 0 && <p className="px-4 pb-4 text-sm text-muted">Sin órdenes de compra confirmadas en los últimos 12 meses.</p>}
            </div>
            {detail.warnings.map(warning => <p key={warning} className="text-xs text-muted">{warning}</p>)}
          </>}
        </section>
      )}
    </div>
  );
}
