'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Package, Check, AlertCircle, Plus, Minus, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VariantAttributeValue {
  id: number;
  ptavId: number;
  name: string;
  htmlColor: string | false;
  priceExtra: number;
}

interface VariantAttribute {
  id: number;
  name: string;
  values: VariantAttributeValue[];
}

interface VariantData {
  id: number;
  name: string;
  default_code: string | null;
  image_128: string | null;
  lst_price: number;
  attribute_value_ids: number[];
}

interface VariantsResponse {
  template_id: number;
  variant_count: number;
  attributes: VariantAttribute[];
  variants: VariantData[];
}

interface ProductBase {
  id: number;
  name: string;
  image_128: string | false;
  list_price: number;
  uom_name: string;
}

export interface VariantSelection {
  variantId: number;
  variantName: string;
  price: number;
  image: string | null;
  defaultCode: string | null;
  selectedAttributes: string;
  quantity: number;
}

interface VariantSelectorModalProps {
  product: ProductBase;
  open: boolean;
  onClose: () => void;
  onAddToCart: (variants: VariantSelection[]) => void;
  showPrices: boolean;
}

export default function VariantSelectorModal({
  product,
  open,
  onClose,
  onAddToCart,
  showPrices,
}: VariantSelectorModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VariantsResponse | null>(null);
  // Map<variantId, quantity>
  const [selected, setSelected] = useState<Map<number, number>>(new Map());

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Map());
    try {
      const params = new URLSearchParams();
      if (Number.isFinite(product.list_price) && product.list_price > 0) {
        params.set('fallback_price', String(product.list_price));
      }
      const queryString = params.toString();
      const res = await fetch(`/api/odoo/productos/${product.id}/variantes${queryString ? `?${queryString}` : ''}`);
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || 'Error cargando variantes');
      }
      const json: VariantsResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [product.id, product.list_price]);

  useEffect(() => {
    if (open) {
      fetchVariants();
    }
  }, [open, fetchVariants]);

  if (!open) return null;

  const toggleVariant = (variantId: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
      } else {
        next.set(variantId, 1);
      }
      return next;
    });
  };

  const updateVariantQty = (variantId: number, qty: number) => {
    if (qty < 1) {
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(variantId);
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(variantId, qty);
      return next;
    });
  };

  const getVariantLabel = (variant: VariantData): string => {
    if (!data) return '';
    const labels: string[] = [];
    for (const attr of data.attributes) {
      const matchVal = attr.values.find((v) => variant.attribute_value_ids.includes(v.ptavId));
      if (matchVal) labels.push(matchVal.name);
    }
    return labels.join(' / ');
  };

  const totalSelected = Array.from(selected.values()).reduce((s, q) => s + q, 0);

  const handleAdd = () => {
    if (!data || selected.size === 0) return;
    const selections: VariantSelection[] = [];
    for (const [variantId, quantity] of selected) {
      const variant = data.variants.find((v) => v.id === variantId);
      if (!variant) continue;
      selections.push({
        variantId: variant.id,
        variantName: variant.name,
        price: variant.lst_price,
        image: variant.image_128 || (typeof product.image_128 === 'string' ? product.image_128 : null),
        defaultCode: variant.default_code,
        selectedAttributes: getVariantLabel(variant),
        quantity,
      });
    }
    onAddToCart(selections);
    onClose();
  };

  const productImage = typeof product.image_128 === 'string' ? product.image_128 : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h3 className="text-lg font-bold text-foreground">Seleccionar variantes</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-background-light transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted">Cargando variantes...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8 gap-3 text-red-600">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">{error}</p>
              <button
                onClick={fetchVariants}
                className="text-sm text-primary hover:underline"
              >
                Reintentar
              </button>
            </div>
          ) : data ? (
            <>
              {/* Producto info */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-background-light rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                  {productImage ? (
                    <img
                      src={productImage.startsWith('data:') ? productImage : `data:image/png;base64,${productImage}`}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Package className="w-7 h-7 text-border" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground text-sm leading-tight">
                    {product.name}
                  </h4>
                  <p className="text-xs text-muted mt-1">
                    {data.variant_count} variantes disponibles — selecciona una o varias
                  </p>
                </div>
              </div>

              {/* Lista de variantes como grid seleccionable */}
              <div className="space-y-2">
                {data.variants.map((variant) => {
                  const isSelected = selected.has(variant.id);
                  const qty = selected.get(variant.id) ?? 0;
                  const label = getVariantLabel(variant);
                  const colorAttr = data.attributes.find((a) =>
                    a.values.some((v) => v.htmlColor && variant.attribute_value_ids.includes(v.ptavId))
                  );
                  const colorVal = colorAttr?.values.find(
                    (v) => v.htmlColor && variant.attribute_value_ids.includes(v.ptavId)
                  );

                  return (
                    <div
                      key={variant.id}
                      className={cn(
                        'rounded-xl border-2 p-3 transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Color swatch o imagen */}
                        {colorVal?.htmlColor ? (
                          <button
                            onClick={() => toggleVariant(variant.id)}
                            className={cn(
                              'w-9 h-9 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
                              isSelected
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-border'
                            )}
                            style={{ backgroundColor: colorVal.htmlColor as string }}
                          >
                            {isSelected && (
                              <Check
                                className={cn(
                                  'w-4 h-4',
                                  isLightColor(colorVal.htmlColor as string) ? 'text-gray-800' : 'text-white'
                                )}
                              />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleVariant(variant.id)}
                            className={cn(
                              'w-9 h-9 rounded-lg border-2 shrink-0 flex items-center justify-center transition-all',
                              isSelected
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-background-light'
                            )}
                          >
                            {isSelected ? (
                              <Check className="w-4 h-4 text-primary" />
                            ) : (
                              <Plus className="w-4 h-4 text-muted" />
                            )}
                          </button>
                        )}

                        {/* Info */}
                        <button
                          onClick={() => toggleVariant(variant.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className={cn(
                            'text-sm font-medium',
                            isSelected ? 'text-primary' : 'text-foreground'
                          )}>
                            {label || variant.name}
                          </p>
                          {variant.default_code && (
                            <p className="text-xs text-muted font-mono">Ref: {variant.default_code}</p>
                          )}
                        </button>

                        {/* Precio */}
                        {showPrices && (
                          <span className="text-sm font-semibold text-foreground shrink-0">
                            ${variant.lst_price.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                          </span>
                        )}

                        {/* Cantidad (solo si seleccionada) */}
                        {isSelected && (
                          <div className="flex items-center gap-1 shrink-0 ml-1">
                            <button
                              onClick={() => updateVariantQty(variant.id, qty - 1)}
                              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (Number.isFinite(val) && val > 0) updateVariantQty(variant.id, val);
                              }}
                              className="w-10 text-center text-sm font-semibold border border-border rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <button
                              onClick={() => updateVariantQty(variant.id, qty + 1)}
                              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {!loading && !error && data && (
          <div className="p-5 border-t border-border shrink-0">
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
                selected.size > 0
                  ? 'bg-primary text-white hover:bg-primary-dark'
                  : 'bg-border text-muted cursor-not-allowed'
              )}
            >
              <ShoppingCart className="w-4 h-4" />
              {selected.size > 0
                ? `Agregar ${totalSelected} ${totalSelected === 1 ? 'unidad' : 'unidades'} (${selected.size} ${selected.size === 1 ? 'variante' : 'variantes'})`
                : 'Selecciona al menos una variante'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}
