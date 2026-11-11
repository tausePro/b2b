'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, Loader2, PackageSearch, Search } from 'lucide-react';
import {
  buildOdooPricelistCsv, buildWorkCsv, pricelistName,
  type CustomerProductsReport, type CustomerSearchResult,
} from '@/lib/gerencia/productosCliente';

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });
const quantity = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const formatDate = (value: string | null) => (value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : '—');
const cell = 'px-4 py-3 text-right tabular-nums align-top';
const heading = 'px-4 py-3 text-right font-medium text-muted';
const input = 'mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-background-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';

type Loaded<T> = { key: string; data: T | null; error: string | null };
type Detail = { id: number; from: string; to: string };

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? 'No se pudo consultar Odoo.');
  return payload as T;
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const fileSlug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cliente';

export default function ProductosCliente() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [results, setResults] = useState<Loaded<CustomerSearchResult[]> | null>(null);
  const [report, setReport] = useState<Loaded<CustomerProductsReport> | null>(null);
  const detailKey = detail ? `${detail.id}:${detail.from}:${detail.to}` : '';

  useEffect(() => {
    if (search.length < 2) return;
    const controller = new AbortController();
    fetchJson<{ clientes: CustomerSearchResult[] }>(`/api/gerencia/productos-cliente?${new URLSearchParams({ buscar: search })}`, controller.signal)
      .then(data => setResults({ key: search, data: data.clientes, error: null }))
      .catch(error => { if (!controller.signal.aborted) setResults({ key: search, data: null, error: error.message }); });
    return () => controller.abort();
  }, [search]);

  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ cliente_id: String(detail.id) });
    if (detail.from) params.set('desde', detail.from);
    if (detail.to) params.set('hasta', detail.to);
    fetchJson<CustomerProductsReport>(`/api/gerencia/productos-cliente?${params}`, controller.signal)
      .then(data => { setReport({ key: detailKey, data, error: null }); setPeriod(data.range); })
      .catch(error => { if (!controller.signal.aborted) setReport({ key: detailKey, data: null, error: error.message }); });
    return () => controller.abort();
  }, [detail, detailKey]);

  const currentResults = results?.key === search ? results : null;
  const currentReport = detail && report?.key === detailKey ? report : null;
  const data = currentReport?.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><PackageSearch className="h-6 w-6 text-primary" aria-hidden="true" />Productos por cliente</h1>
        <p className="mt-1 text-sm text-muted">Busca un cliente de Odoo, revisa los productos que ha comprado y descarga la base para crear su lista de precios.</p>
      </header>

      {!detail && <>
        <form role="search" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); }}>
          <label className="min-w-64 flex-1 text-sm font-medium">Cliente (nombre o NIT)
            <input type="search" value={draft} minLength={2} maxLength={80} required onChange={(event) => setDraft(event.target.value)} className={input} />
          </label>
          <button type="submit" className={button}><Search className="h-4 w-4" aria-hidden="true" />Buscar</button>
        </form>
        {search.length >= 2 && !currentResults && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Buscando clientes en Odoo…</p>}
        {currentResults?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{currentResults.error}</p>}
        {currentResults?.data && (
          <div className="overflow-x-auto rounded-xl border border-border bg-white" role="region" aria-labelledby="clientes-resultados" tabIndex={0}>
            <table className="w-full text-sm">
              <caption id="clientes-resultados" className="px-4 py-3 text-left font-semibold">Clientes encontrados (máximo 20)</caption>
              <thead className="bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Cliente</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Tarifa en Odoo</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Última factura</th><th scope="col" className="px-4 py-3"><span className="sr-only">Acción</span></th></tr></thead>
              <tbody>{currentResults.data.map(customer => (
                <tr key={customer.id} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 text-left font-medium">{customer.name}<span className="mt-1 block text-xs font-normal text-muted">NIT: {customer.vat ?? 'No registrado'}</span></th>
                  <td className="px-4 py-3">{customer.pricelistName ?? '—'}</td>
                  <td className="px-4 py-3">{formatDate(customer.lastInvoiceDate)}</td>
                  <td className="px-4 py-3 text-right"><button type="button" className={button} onClick={() => setDetail({ id: customer.id, from: '', to: '' })}>Ver productos</button></td>
                </tr>
              ))}</tbody>
            </table>
            {currentResults.data.length === 0 && <p className="px-4 pb-4 text-sm text-muted">No hay clientes que coincidan con la búsqueda.</p>}
          </div>
        )}
      </>}

      {detail && (
        <section aria-labelledby="productos-cliente" className="space-y-4">
          <button type="button" className={button} onClick={() => { setDetail(null); setReport(null); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver a la búsqueda</button>
          {!currentReport && <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Consultando facturas del cliente…</p>}
          {currentReport?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{currentReport.error}</p>}
          {data && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="productos-cliente" className="text-lg font-semibold">{data.customer.name}</h2>
                <p className="text-sm text-muted">NIT: {data.customer.vat ?? 'No registrado'} · Tarifa actual en Odoo: {data.customer.pricelistName ?? 'ninguna'} · {data.invoiceCount} facturas · {data.products.length} productos</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={data.products.length === 0} onClick={() => download(`productos-${fileSlug(data.customer.name)}-${data.range.from}-a-${data.range.to}.csv`, buildWorkCsv(data))}><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />Descargar Excel para trabajar</button>
                <button type="button" className={button} disabled={data.products.length === 0} onClick={() => download(`tarifa-odoo-${fileSlug(data.customer.name)}.csv`, buildOdooPricelistCsv(data))}><Download className="h-4 w-4" aria-hidden="true" />Descargar para importar en Odoo</button>
              </div>
            </div>
            <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4" onSubmit={(event) => { event.preventDefault(); setDetail({ id: data.customer.id, from: period.from, to: period.to }); }}>
              <label className="text-sm font-medium">Desde<input type="date" value={period.from} max={period.to || undefined} required onChange={(event) => setPeriod(value => ({ ...value, from: event.target.value }))} className={input} /></label>
              <label className="text-sm font-medium">Hasta<input type="date" value={period.to} min={period.from || undefined} required onChange={(event) => setPeriod(value => ({ ...value, to: event.target.value }))} className={input} /></label>
              <button type="submit" className={button}>Aplicar período</button>
            </form>
            <div className="overflow-auto rounded-xl border border-border bg-white" style={{ maxBlockSize: 'min(720px, 80vh)' }} role="region" aria-labelledby="productos-cliente-tabla" tabIndex={0}>
              <table className="w-full border-separate border-spacing-0 text-sm">
                <caption id="productos-cliente-tabla" className="px-4 py-3 text-left font-semibold">Productos comprados del {formatDate(data.range.from)} al {formatDate(data.range.to)}</caption>
                <thead className="sticky top-0 z-10 bg-background-light"><tr><th scope="col" className="px-4 py-3 text-left font-medium text-muted">SKU</th><th scope="col" className="px-4 py-3 text-left font-medium text-muted">Producto</th><th scope="col" className={heading}>Cantidad (neta)</th><th scope="col" className={heading}>Veces comprado</th><th scope="col" className={heading}>Última compra</th></tr></thead>
                <tbody>{data.products.map(product => (
                  <tr key={product.productId}>
                    <td className="border-t border-border px-4 py-3 align-top font-mono text-xs">{product.sku ?? '—'}</td>
                    <th scope="row" className="border-t border-border px-4 py-3 text-left align-top font-medium">{product.name}</th>
                    <td className={`${cell} border-t border-border`}>{quantity.format(product.quantity)} {product.unitName}{product.mixedUnits && <span className="mt-1 block text-xs text-amber-800">Unidades mixtas</span>}</td>
                    <td className={`${cell} border-t border-border`}>{product.purchaseCount}</td>
                    <td className={`${cell} border-t border-border`}>{formatDate(product.lastPurchase)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {data.products.length === 0 && <p className="px-4 pb-4 text-sm text-muted">El cliente no tiene productos facturados en el período.</p>}
            </div>
            <div className="space-y-1 text-xs text-muted">
              {data.warnings.map(warning => <p key={warning}>{warning}</p>)}
              <p>Para importar en Odoo: crea la tarifa &quot;{pricelistName(data)}&quot; en Ventas › Configuración › Tarifas, llena la columna fixed_price del archivo y cárgalo en Reglas de tarifa › Importar.</p>
            </div>
          </>}
        </section>
      )}
    </div>
  );
}
