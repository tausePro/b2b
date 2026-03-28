'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { ProductoOdoo, TipoPedidoItem } from '@/types';

export interface CartItem {
  id: string;
  tipo_item: TipoPedidoItem;
  odoo_product_id: number | null;
  odoo_variant_id?: number | null;
  nombre_producto: string;
  precio_unitario_cop: number;
  unidad?: string | null;
  categoria?: string;
  disponible?: boolean;
  imagen_url?: string;
  referencia?: string | null;
  referencia_cliente?: string | null;
  comentarios_item?: string | null;
  variante_label?: string | null;
  cantidad: number;
}

export interface SpecialCartItemInput {
  nombre_producto: string;
  cantidad: number;
  unidad?: string | null;
  referencia_cliente?: string | null;
  comentarios_item?: string | null;
}

export interface VariantCartInput {
  templateId: number;
  variantId: number;
  variantName: string;
  price: number;
  image: string | null;
  defaultCode: string | null;
  selectedAttributes: string;
  unidad?: string;
  categoria?: string;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  addItem: (producto: ProductoOdoo, cantidad?: number) => void;
  addVariantItem: (input: VariantCartInput, cantidad?: number) => void;
  addSpecialItem: (item: SpecialCartItemInput) => void;
  removeItem: (itemIdOrOdooProductId: string | number) => void;
  updateQuantity: (itemIdOrOdooProductId: string | number, cantidad: number) => void;
  clearCart: () => void;
  getItemQuantity: (odooProductId: number) => number;
  replaceAllItems: (newItems: CartItem[]) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function createCatalogItemId(odooProductId: number) {
  return `catalogo:${odooProductId}`;
}

function createVariantItemId(variantId: number) {
  return `variante:${variantId}`;
}

function createSpecialItemId() {
  return globalThis.crypto?.randomUUID?.() ?? `especial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function matchesCartItem(item: CartItem, itemIdOrOdooProductId: string | number) {
  if (typeof itemIdOrOdooProductId === 'string') {
    return item.id === itemIdOrOdooProductId;
  }

  return item.tipo_item === 'catalogo' && item.odoo_product_id === itemIdOrOdooProductId;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((producto: ProductoOdoo, cantidad: number = 1) => {
    const itemId = createCatalogItemId(producto.odoo_product_id);

    setItems((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        return prev.map((item) =>
          item.id === itemId
            ? { ...item, cantidad: item.cantidad + cantidad }
            : item
        );
      }

      return [
        ...prev,
        {
          id: itemId,
          tipo_item: 'catalogo',
          odoo_product_id: producto.odoo_product_id,
          nombre_producto: producto.nombre,
          precio_unitario_cop: producto.precio_unitario,
          unidad: producto.unidad,
          categoria: producto.categoria,
          disponible: producto.disponible,
          imagen_url: producto.imagen_url,
          referencia: producto.referencia ?? null,
          cantidad,
        },
      ];
    });
  }, []);

  const addVariantItem = useCallback((input: VariantCartInput, cantidad: number = 1) => {
    const itemId = createVariantItemId(input.variantId);

    setItems((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        return prev.map((item) =>
          item.id === itemId
            ? { ...item, cantidad: item.cantidad + cantidad }
            : item
        );
      }

      return [
        ...prev,
        {
          id: itemId,
          tipo_item: 'catalogo',
          odoo_product_id: input.templateId,
          odoo_variant_id: input.variantId,
          nombre_producto: input.variantName,
          precio_unitario_cop: input.price,
          unidad: input.unidad,
          categoria: input.categoria,
          disponible: true,
          imagen_url: input.image ? (input.image.startsWith('data:') ? input.image : `data:image/png;base64,${input.image}`) : undefined,
          referencia: input.defaultCode ?? null,
          variante_label: input.selectedAttributes,
          cantidad,
        },
      ];
    });
  }, []);

  const addSpecialItem = useCallback((item: SpecialCartItemInput) => {
    setItems((prev) => [
      ...prev,
      {
        id: createSpecialItemId(),
        tipo_item: 'especial',
        odoo_product_id: null,
        nombre_producto: item.nombre_producto.trim(),
        precio_unitario_cop: 0,
        unidad: item.unidad?.trim() || null,
        referencia_cliente: item.referencia_cliente?.trim() || null,
        comentarios_item: item.comentarios_item?.trim() || null,
        cantidad: item.cantidad,
      },
    ]);
  }, []);

  const removeItem = useCallback((itemIdOrOdooProductId: string | number) => {
    setItems((prev) => prev.filter((item) => !matchesCartItem(item, itemIdOrOdooProductId)));
  }, []);

  const updateQuantity = useCallback((itemIdOrOdooProductId: string | number, cantidad: number) => {
    if (cantidad <= 0) {
      setItems((prev) => prev.filter((item) => !matchesCartItem(item, itemIdOrOdooProductId)));
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        matchesCartItem(item, itemIdOrOdooProductId) ? { ...item, cantidad } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const replaceAllItems = useCallback((newItems: CartItem[]) => {
    setItems(newItems);
  }, []);

  const getItemQuantity = useCallback(
    (odooProductId: number) => {
      return items.find((item) => item.tipo_item === 'catalogo' && item.odoo_product_id === odooProductId)?.cantidad ?? 0;
    },
    [items]
  );

  const totalItems = items.reduce((sum, item) => sum + item.cantidad, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        addItem,
        addVariantItem,
        addSpecialItem,
        removeItem,
        updateQuantity,
        clearCart,
        getItemQuantity,
        replaceAllItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart debe usarse dentro de un CartProvider');
  }
  return context;
}
