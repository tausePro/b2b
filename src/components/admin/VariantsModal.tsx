'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2, ShoppingCart, Sparkles, X } from 'lucide-react';
import { formatMarkupPercent } from '@/lib/pricing/cost-staleness';

/**
 * Modal que lista las variantes (product.product) de un template.
 *
 * Consume `/api/odoo/productos/[id]/variantes` que devuelve costo + antigüedad
 * únicamente cuando el rol del actor está autorizado (super_admin, dirección,
 * asesor). Para el resto solo se muestra precio y atributos.
 */

export interface VariantsModalProps {
  /** ID del product.template a inspeccionar. */
  templateId: number;
  /** Nombre comercial del producto, mostrado en el header del modal. */
  productName: string;
  /** Si está abierto. Si false, no se renderiza. */
  open: boolean;
  /** Callback al cerrar (botón X, click fuera, ESC). */
  onClose: () => void;
  /**
   * Precio del producto en la página origen (override por empresa/storefront).
   * Se envía como `fallback_price` para que las variantes sin precio propio
   * lo hereden. Opcional.
   */
  fallbackPrice?: number;
  /**
   * UUID de la empresa cuyo pricing se quiere aplicar. Cuando el admin abre
   * el modal desde /admin/empresas/<id>, se pasa para que el endpoint resuelva
   * precios usando los márgenes y overrides de esa empresa específica (el
   * admin no tiene empresa_id propio).
   */
  empresaId?: string;
  /**
   * UUID del storefront cuyo pricing se quiere aplicar. Análogo a empresaId
   * pero para los storefronts (ej: /admin/empaques).
   */
  storefrontId?: string;
}

interface AttributeValueResponse {
  id: number;
  name: string;
  html_color: string | false;
}

interface AttributeResponse {
  id: number;
  name: string;
  values: AttributeValueResponse[];
}

interface VariantResponse {
  id: number;
  name: string;
  default_code: string | null;
  image_128: string | null;
  lst_price: number;
  attribute_value_ids: number[];
  /**
   * Costo efectivo mostrado al usuario. Prioriza la última compra real
   * (factura > orden); cae a standard_price si no hay historial.
   */
  costo?: number;
  costo_source?: 'invoice' | 'order' | 'standard_price' | null;
  costo_fecha?: string | null;
  costo_proveedor?: string | null;
  costo_documento?: string | null;
  costo_moneda?: string | null;
  /** standard_price del producto en Odoo (AVCO/FIFO) — info auxiliar. */
  standard_price?: number;
  dias_desde_actualizacion?: number | null;
  costo_desactualizado?: boolean | null;
  markup_porcentaje?: number | null;
}

interface VariantsApiResponse {
  template_id: number;
  variant_count: number;
  attributes: AttributeResponse[];
  variants: VariantResponse[];
  can_see_cost: boolean;
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/**
 * Badge que indica la procedencia del costo mostrado:
 *   - invoice   → última factura de proveedor posted (la fuente más fiel).
 *   - order     → última orden de compra confirmada (sin factura aún).
 *   - standard_price → no hay historial; usamos el campo Costo de Odoo.
 *
 * Incluye tooltip con proveedor, documento y fecha cuando hay info.
 */
function CostoSourceBadge({
  source,
  proveedor,
  documento,
  fecha,
  standardPrice,
}: {
  source: 'invoice' | 'order' | 'standard_price' | null;
  proveedor?: string | null;
  documento?: string | null;
  fecha?: string | null;
  standardPrice?: number;
}) {
  if (!source) return null;

  const fechaFmt = fecha ? formatDateSafe(fecha) : null;

  if (source === 'invoice') {
    const tooltip = [
      'Costo de la última factura de proveedor (posted).',
      proveedor ? `Proveedor: ${proveedor}` : null,
      documento ? `Documento: ${documento}` : null,
      fechaFmt ? `Fecha: ${fechaFmt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700"
        title={tooltip}
      >
        <FileText className="h-2.5 w-2.5" />
        Factura {fechaFmt ? `· ${fechaFmt}` : ''}
      </span>
    );
  }

  if (source === 'order') {
    const tooltip = [
      'Costo de la última orden de compra confirmada (aún no facturada).',
      proveedor ? `Proveedor: ${proveedor}` : null,
      documento ? `Documento: ${documento}` : null,
      fechaFmt ? `Fecha: ${fechaFmt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700"
        title={tooltip}
      >
        <ShoppingCart className="h-2.5 w-2.5" />
        Orden {fechaFmt ? `· ${fechaFmt}` : ''}
      </span>
    );
  }

  // standard_price (fallback). Mostramos comparación si existe.
  const tooltip = [
    'Sin facturas ni órdenes registradas en los últimos 3 años.',
    'Costo tomado del campo "Costo" del producto (promedio AVCO/FIFO).',
    typeof standardPrice === 'number' && standardPrice > 0
      ? `standard_price: ${currencyFormatter.format(standardPrice)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700"
      title={tooltip}
    >
      <Sparkles className="h-2.5 w-2.5" />
      Estimado
    </span>
  );
}

/**
 * Formatea una fecha YYYY-MM-DD o ISO a "10 may 2026". Devuelve null si
 * la fecha no es parseable.
 */
function formatDateSafe(value: string): string | null {
  // Aceptamos "YYYY-MM-DD" y ISO completos. new Date('YYYY-MM-DD') es UTC,
  // pero para mostrar el día es suficiente.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return dateFormatter.format(d);
}

export function VariantsModal({ templateId, productName, open, onClose, fallbackPrice, empresaId, storefrontId }: VariantsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VariantsApiResponse | null>(null);

  // Cerrar con ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams();
      if (typeof fallbackPrice === 'number' && fallbackPrice > 0) {
        params.set('fallback_price', String(fallbackPrice));
      }
      if (empresaId) {
        params.set('empresa_id', empresaId);
      }
      if (storefrontId) {
        params.set('storefront_id', storefrontId);
      }
      const qs = params.toString();
      const url = `/api/odoo/productos/${templateId}/variantes${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Error ${res.status} consultando variantes.`);
      }
      const json = (await res.json()) as VariantsApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  }, [templateId, fallbackPrice, empresaId, storefrontId]);

  useEffect(() => {
    if (open) {
      void fetchVariants();
    }
  }, [open, fetchVariants]);

  if (!open) return null;

  const variantes = data?.variants ?? [];
  const canSeeCost = data?.can_see_cost === true;

  // Construir mapa de valor de atributo para etiquetas.
  const attrValueMap = new Map<number, { attrName: string; valueName: string; color?: string | null }>();
  if (data?.attributes) {
    for (const attr of data.attributes) {
      for (const val of attr.values) {
        attrValueMap.set(val.id, {
          attrName: attr.name,
          valueName: val.name,
          color: typeof val.html_color === 'string' ? val.html_color : null,
        });
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="variants-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[90vh]">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Variantes del producto</p>
            <h2 id="variants-modal-title" className="mt-0.5 truncate text-lg font-bold text-slate-900">
              {productName}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {loading ? 'Cargando…' : `${data?.variant_count ?? 0} variantes`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {error && !loading && (
            <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">No se pudieron cargar las variantes</p>
              <p className="mt-1">{error}</p>
              <button
                onClick={() => void fetchVariants()}
                className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && variantes.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              Este producto no tiene variantes activas.
            </div>
          )}

          {!loading && !error && variantes.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-left">Variante</th>
                  <th className="px-3 py-3 text-right">Precio venta</th>
                  {canSeeCost && <th className="px-3 py-3 text-right">Costo</th>}
                  {canSeeCost && <th className="px-3 py-3 text-right">Markup</th>}
                  {canSeeCost && <th className="px-3 py-3 text-center">Antigüedad</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {variantes.map((v) => {
                  const attrs = v.attribute_value_ids
                    .map((id) => attrValueMap.get(id))
                    .filter((x): x is NonNullable<typeof x> => Boolean(x));
                  const stale = v.costo_desactualizado === true;
                  const markup = v.markup_porcentaje;
                  const markupColor =
                    typeof markup !== 'number'
                      ? 'text-slate-400'
                      : markup < 0
                        ? 'text-red-600 font-bold'
                        : markup < 10
                          ? 'text-amber-600'
                          : 'text-emerald-600';

                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {v.image_128 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`data:image/png;base64,${v.image_128}`}
                              alt={v.name}
                              className="h-10 w-10 flex-shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
                            />
                          ) : (
                            <div className="h-10 w-10 flex-shrink-0 rounded-md border border-slate-200 bg-slate-50" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{v.name}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {v.default_code && (
                                <span className="text-[10px] font-mono text-slate-500">{v.default_code}</span>
                              )}
                              {attrs.map((a, i) => (
                                <span
                                  key={`${v.id}-attr-${i}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                                  title={`${a.attrName}: ${a.valueName}`}
                                >
                                  {a.color && (
                                    <span
                                      className="inline-block h-2 w-2 rounded-full border border-slate-300"
                                      style={{ backgroundColor: a.color }}
                                    />
                                  )}
                                  {a.valueName}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {currencyFormatter.format(v.lst_price || 0)}
                      </td>
                      {canSeeCost && (
                        <td
                          className={`px-3 py-3 text-right whitespace-nowrap ${
                            stale ? 'text-red-600 font-semibold' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-medium">{currencyFormatter.format(v.costo ?? 0)}</span>
                            {v.costo_source && (
                              <CostoSourceBadge
                                source={v.costo_source}
                                proveedor={v.costo_proveedor}
                                documento={v.costo_documento}
                                fecha={v.costo_fecha}
                                standardPrice={v.standard_price}
                              />
                            )}
                          </div>
                        </td>
                      )}
                      {canSeeCost && (
                        <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${markupColor}`}>
                          {typeof markup === 'number' ? (
                            <span className="inline-flex items-center gap-0.5">
                              {markup < 0 && <AlertTriangle className="h-3 w-3" />}
                              {formatMarkupPercent(markup)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {canSeeCost && (
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {typeof v.dias_desde_actualizacion === 'number' ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                stale ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'
                              }`}
                              title={
                                v.costo_source === 'standard_price'
                                  ? 'Días desde la última modificación del producto en Odoo (sin historial de compras). Costo puede estar desactualizado.'
                                  : `Días desde la última ${v.costo_source === 'invoice' ? 'factura' : 'orden'} registrada${v.costo_proveedor ? ` con ${v.costo_proveedor}` : ''}.`
                              }
                            >
                              {stale && <AlertTriangle className="h-2.5 w-2.5" />}
                              {v.dias_desde_actualizacion === 0 ? 'hoy' : `${v.dias_desde_actualizacion}d`}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {canSeeCost && !loading && !error && variantes.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-500 space-y-1">
            <div>
              <strong>Costo</strong> = precio unitario de la última operación de compra
              (factura de proveedor o orden confirmada, lo más reciente). Si no hay historial
              de compras en los últimos 3 años, se muestra el campo &quot;Costo&quot; del producto en Odoo
              (badge <em>Estimado</em>).
            </div>
            <div>
              <strong>Markup</strong> = (precio − costo) / costo × 100.{' '}
              <strong>Antigüedad</strong> = días desde la fecha del documento que dio origen al costo.
              Una variante con &gt; 30 días probablemente tiene el costo desactualizado.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
