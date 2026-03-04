'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { ProductoOdoo } from '@/types';

export interface CartItem {
  producto: ProductoOdoo;
  cantidad: number;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  addItem: (producto: ProductoOdoo, cantidad?: number) => void;
  removeItem: (odooProductId: number) => void;
  updateQuantity: (odooProductId: number, cantidad: number) => void;
  clearCart: () => void;
  getItemQuantity: (odooProductId: number) => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((producto: ProductoOdoo, cantidad: number = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.producto.odoo_product_id === producto.odoo_product_id);
      if (existing) {
        return prev.map((item) =>
          item.producto.odoo_product_id === producto.odoo_product_id
            ? { ...item, cantidad: item.cantidad + cantidad }
            : item
        );
      }
      return [...prev, { producto, cantidad }];
    });
  }, []);

  const removeItem = useCallback((odooProductId: number) => {
    setItems((prev) => prev.filter((item) => item.producto.odoo_product_id !== odooProductId));
  }, []);

  const updateQuantity = useCallback((odooProductId: number, cantidad: number) => {
    if (cantidad <= 0) {
      setItems((prev) => prev.filter((item) => item.producto.odoo_product_id !== odooProductId));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.producto.odoo_product_id === odooProductId ? { ...item, cantidad } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getItemQuantity = useCallback(
    (odooProductId: number) => {
      return items.find((item) => item.producto.odoo_product_id === odooProductId)?.cantidad ?? 0;
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
        removeItem,
        updateQuantity,
        clearCart,
        getItemQuantity,
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
