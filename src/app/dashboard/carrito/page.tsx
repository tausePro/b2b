'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP } from '@/lib/utils';
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CarritoPage() {
  const { user, showPrices } = useAuth();
  const { items, totalItems, updateQuantity, removeItem, clearCart } = useCart();
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [empresaConfig, setEmpresaConfig] = useState<{ requiere_aprobacion: boolean; usa_sedes: boolean } | null>(null);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const cargarConfigEmpresa = async () => {
      if (!user?.empresa_id) return;

      const { data } = await supabase
        .from('empresas')
        .select('requiere_aprobacion, usa_sedes')
        .eq('id', user.empresa_id)
        .single();

      if (data) {
        setEmpresaConfig({
          requiere_aprobacion: data.requiere_aprobacion,
          usa_sedes: data.usa_sedes,
        });
      }
    };

    cargarConfigEmpresa();
  }, [supabase, user?.empresa_id]);

  const totalPrecio = items.reduce(
    (sum, item) => sum + item.producto.precio_unitario * item.cantidad,
    0
  );

  const categorias = [...new Set(items.map((item) => item.producto.categoria))];

  const requiereAprobacion = empresaConfig?.requiere_aprobacion ?? true;
  const ctaTexto = requiereAprobacion ? 'Enviar a Aprobación' : 'Enviar Pedido';
  const ayudaTexto = requiereAprobacion
    ? 'El pedido será revisado por el gerente de tu empresa'
    : 'El pedido se registrará como aprobado y pasará a validación de Imprima';

  const handleEnviarAprobacion = async () => {
    if (!user || items.length === 0) return;

    const usaSedes = empresaConfig?.usa_sedes ?? true;
    if (usaSedes && !user.sede_id) {
      alert('Tu empresa opera con sedes y tu usuario no tiene una sede asignada. Contacta al administrador.');
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comentarios_sede: observaciones || null,
          items: items.map((item) => ({
            odoo_product_id: item.producto.odoo_product_id,
            nombre_producto: item.producto.nombre,
            cantidad: item.cantidad,
            precio_unitario_cop: item.producto.precio_unitario,
          })),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'Error al crear el pedido.');
      }

      if (payload.warning) {
        console.warn('[Carrito] Advertencia en creación de pedido:', payload.warning);
      }

      clearCart();
      router.push('/dashboard/pedidos');
    } catch (err) {
      console.error('Error:', err);
      alert('Error inesperado. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carrito de Pedido</h1>
          <p className="text-muted text-sm mt-1">Revisión de productos seleccionados</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-border mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Tu carrito está vacío</h2>
          <p className="text-sm text-muted mb-6">Agrega productos desde el catálogo para crear un pedido</p>
          <Link
            href="/dashboard/catalogo"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            Ir al Catálogo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revisión de Pedido</h1>
          <p className="text-muted text-sm mt-1">
            {totalItems} productos seleccionados
            {!showPrices && ' — Sin precios visibles para tu rol'}
          </p>
        </div>
        <Link
          href="/dashboard/catalogo"
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-dark font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Seguir comprando
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de productos */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div
              key={item.producto.odoo_product_id}
              className="bg-white rounded-xl border border-border p-4 flex gap-4"
            >
              {/* Imagen placeholder */}
              <div className="w-16 h-16 bg-background-light rounded-lg flex items-center justify-center shrink-0">
                <span className="text-xl">
                  {item.producto.categoria === 'cafeteria' && '☕'}
                  {item.producto.categoria === 'papeleria' && '📄'}
                  {item.producto.categoria === 'aseo' && '🧹'}
                  {item.producto.categoria === 'personalizados' && '🎨'}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">ID Odoo: {item.producto.odoo_product_id}</p>
                    <h3 className="text-sm font-semibold text-foreground">{item.producto.nombre}</h3>
                    {showPrices && (
                      <p className="text-sm text-muted mt-0.5">
                        {formatCOP(item.producto.precio_unitario)} / {item.producto.unidad}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.producto.odoo_product_id)}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.producto.odoo_product_id, item.cantidad - 1)}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-semibold w-10 text-center">{item.cantidad}</span>
                    <button
                      onClick={() => updateQuantity(item.producto.odoo_product_id, item.cantidad + 1)}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  {showPrices && (
                    <p className="text-sm font-bold text-foreground">
                      {formatCOP(item.producto.precio_unitario * item.cantidad)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Resumen del pedido */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-5 sticky top-20">
            <h2 className="font-semibold text-foreground mb-4">Resumen del Pedido</h2>

            {/* Categorías */}
            <div className="space-y-2 mb-4">
              {categorias.map((cat) => {
                const catItems = items.filter((i) => i.producto.categoria === cat);
                const catUnits = catItems.reduce((s, i) => s + i.cantidad, 0);
                return (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-muted capitalize">{cat}</span>
                    <span className="font-medium">{catUnits} und</span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Total Unidades</span>
                <span className="font-bold text-lg">{totalItems}</span>
              </div>
              {showPrices && (
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-muted">Total Estimado</span>
                  <span className="font-bold text-lg text-primary">{formatCOP(totalPrecio)}</span>
                </div>
              )}
            </div>

            {/* Observaciones */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Observaciones
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Instrucciones especiales para este pedido..."
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Botón enviar */}
            <button
              onClick={handleEnviarAprobacion}
              disabled={enviando}
              className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {ctaTexto}
                </>
              )}
            </button>

            <p className="text-xs text-muted text-center mt-3">
              {ayudaTexto}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
