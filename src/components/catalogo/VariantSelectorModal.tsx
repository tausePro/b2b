'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Package, Check, AlertCircle } from 'lucide-react';
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

interface VariantSelectorModalProps {
  product: ProductBase;
  open: boolean;
  onClose: () => void;
  onAddToCart: (variant: {
    variantId: number;
    variantName: string;
    price: number;
    image: string | null;
    defaultCode: string | null;
    selectedAttributes: string;
  }) => void;
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
  const [selectedValues, setSelectedValues] = useState<Map<number, number>>(new Map());

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/odoo/productos/${product.id}/variantes`);
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || 'Error cargando variantes');
      }
      const json: VariantsResponse = await res.json();
      setData(json);

      // Auto-seleccionar el primer valor de cada atributo
      const initial = new Map<number, number>();
      for (const attr of json.attributes) {
        if (attr.values.length > 0) {
          initial.set(attr.id, attr.values[0].ptavId);
        }
      }
      setSelectedValues(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    if (open) {
      fetchVariants();
    }
  }, [open, fetchVariants]);

  if (!open) return null;

  const handleSelectValue = (attrId: number, ptavId: number) => {
    setSelectedValues((prev) => {
      const next = new Map(prev);
      next.set(attrId, ptavId);
      return next;
    });
  };

  // Encontrar la variante que coincide con los atributos seleccionados
  const selectedPtavIds = Array.from(selectedValues.values());
  const matchingVariant = data?.variants.find((v) =>
    selectedPtavIds.every((ptavId) => v.attribute_value_ids.includes(ptavId))
  );

  // Calcular precio con extras
  const priceExtra = data?.attributes.reduce((sum, attr) => {
    const selectedPtavId = selectedValues.get(attr.id);
    const value = attr.values.find((v) => v.ptavId === selectedPtavId);
    return sum + (value?.priceExtra || 0);
  }, 0) ?? 0;

  const effectivePrice = matchingVariant?.lst_price ?? (product.list_price + priceExtra);
  const effectiveImage = matchingVariant?.image_128 || (product.image_128 || null);

  const selectedLabel = data?.attributes
    .map((attr) => {
      const ptavId = selectedValues.get(attr.id);
      const val = attr.values.find((v) => v.ptavId === ptavId);
      return val?.name;
    })
    .filter(Boolean)
    .join(' / ') || '';

  const handleAdd = () => {
    if (!matchingVariant) return;
    onAddToCart({
      variantId: matchingVariant.id,
      variantName: matchingVariant.name,
      price: effectivePrice,
      image: effectiveImage,
      defaultCode: matchingVariant.default_code,
      selectedAttributes: selectedLabel,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">Seleccionar variante</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-background-light transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
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
                <div className="w-20 h-20 bg-background-light rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                  {effectiveImage ? (
                    <img
                      src={effectiveImage.startsWith('data:') ? effectiveImage : `data:image/png;base64,${effectiveImage}`}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Package className="w-8 h-8 text-border" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground text-sm leading-tight">
                    {product.name}
                  </h4>
                  {matchingVariant?.default_code && (
                    <p className="text-xs text-muted font-mono mt-1">Ref: {matchingVariant.default_code}</p>
                  )}
                  {showPrices && (
                    <p className="text-lg font-bold text-primary mt-1">
                      ${effectivePrice.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                      <span className="text-xs text-muted font-normal ml-1">/{product.uom_name || 'und'}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Atributos */}
              {data.attributes.map((attr) => (
                <div key={attr.id}>
                  <label className="block text-sm font-semibold text-foreground mb-2.5">
                    {attr.name}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((val) => {
                      const isSelected = selectedValues.get(attr.id) === val.ptavId;
                      const hasColor = val.htmlColor && typeof val.htmlColor === 'string';

                      if (hasColor) {
                        return (
                          <button
                            key={val.ptavId}
                            onClick={() => handleSelectValue(attr.id, val.ptavId)}
                            title={val.name}
                            className={cn(
                              'relative w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center',
                              isSelected
                                ? 'border-primary ring-2 ring-primary/30 scale-110'
                                : 'border-border hover:border-primary/50'
                            )}
                            style={{ backgroundColor: val.htmlColor as string }}
                          >
                            {isSelected && (
                              <Check
                                className={cn(
                                  'w-4 h-4',
                                  isLightColor(val.htmlColor as string) ? 'text-gray-800' : 'text-white'
                                )}
                              />
                            )}
                          </button>
                        );
                      }

                      return (
                        <button
                          key={val.ptavId}
                          onClick={() => handleSelectValue(attr.id, val.ptavId)}
                          className={cn(
                            'px-4 py-2 rounded-lg text-sm font-medium border transition-all',
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-white text-foreground hover:border-primary/50'
                          )}
                        >
                          {val.name}
                          {showPrices && val.priceExtra > 0 && (
                            <span className="ml-1 text-xs text-muted">
                              (+${val.priceExtra.toLocaleString('es-CO')})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Variante seleccionada */}
              {selectedLabel && (
                <div className="bg-primary/5 rounded-lg px-4 py-3">
                  <p className="text-sm text-primary font-medium">
                    Seleccionado: <span className="font-bold">{selectedLabel}</span>
                  </p>
                </div>
              )}

              {!matchingVariant && selectedPtavIds.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-amber-700">
                    Esta combinación de atributos no está disponible. Intenta con otra selección.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        {!loading && !error && data && (
          <div className="p-5 border-t border-border">
            <button
              onClick={handleAdd}
              disabled={!matchingVariant}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
                matchingVariant
                  ? 'bg-primary text-white hover:bg-primary-dark'
                  : 'bg-border text-muted cursor-not-allowed'
              )}
            >
              <Check className="w-4 h-4" />
              Agregar al carrito
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
