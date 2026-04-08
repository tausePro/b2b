'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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

const CART_STORAGE_PREFIX = 'b2b_cart_';

function getStorageKey(userId: string | null) {
  return userId ? `${CART_STORAGE_PREFIX}${userId}` : null;
}

function loadCartFromStorage(userId: string | null): CartItem[] {
  if (typeof window === 'undefined') return [];
  const key = getStorageKey(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCartToStorage(userId: string | null, items: CartItem[]) {
  if (typeof window === 'undefined') return;
  const key = getStorageKey(userId);
  if (!key) return;
  try {
    const toStore = items.map(({ imagen_url, ...rest }) => rest);
    localStorage.setItem(key, JSON.stringify(toStore));
  } catch {
    // localStorage lleno o no disponible
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<CartItem[]>([]);
  const currentUserRef = useRef<string | null>(null);
  const initialized = useRef(false);

  // Cargar carrito al montar o cuando cambia el usuario
  useEffect(() => {
    if (!userId) {
      if (currentUserRef.current) {
        setItems([]);
        currentUserRef.current = null;
      }
      return;
    }
    if (currentUserRef.current === userId && initialized.current) return;
    currentUserRef.current = userId;
    initialized.current = true;
    const stored = loadCartFromStorage(userId);
    setItems(stored);

    // Recargar imágenes desde Odoo para items que no las tengan
    if (stored.length > 0) {
      const catalogIds = [...new Set(stored.filter((i) => i.tipo_item === 'catalogo' && i.odoo_product_id).map((i) => i.odoo_product_id!))];
      if (catalogIds.length > 0 && user?.empresa_id) {
        (async () => {
          try {
            const { data: empresa } = await (await import('@/lib/supabase/client')).createClient()
              .from('empresas')
              .select('odoo_partner_id')
              .eq('id', user.empresa_id)
              .single();
            if (!empresa?.odoo_partner_id) return;
            const res = await fetch(`/api/odoo/productos?partner_id=${empresa.odoo_partner_id}&limit=500`);
            if (!res.ok) return;
            const data = await res.json();
            const imageMap = new Map<number, string>();
            for (const p of (data.productos || []) as { id: number; image_128: string | false }[]) {
              if (typeof p.image_128 === 'string' && p.image_128) {
                imageMap.set(p.id, `data:image/png;base64,${p.image_128}`);
              }
            }
            if (imageMap.size > 0) {
              setItems((prev) => prev.map((item) => {
                if (item.imagen_url || !item.odoo_product_id) return item;
                const img = imageMap.get(item.odoo_product_id);
                return img ? { ...item, imagen_url: img } : item;
              }));
            }
          } catch {
            // silencioso - las imágenes se cargarán la próxima vez
          }
        })();
      }
    }
  }, [userId, user?.empresa_id]);

  // Guardar en localStorage cada vez que items cambia
  useEffect(() => {
    if (!initialized.current || !currentUserRef.current) return;
    saveCartToStorage(currentUserRef.current, items);
  }, [items]);

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
    const key = getStorageKey(currentUserRef.current);
    if (key) try { localStorage.removeItem(key); } catch { /* noop */ }
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
