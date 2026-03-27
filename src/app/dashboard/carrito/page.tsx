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
  const { items, totalItems, updateQuantity, removeItem, clearCart, addSpecialItem } = useCart();
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [empresaConfig, setEmpresaConfig] = useState<{ requiere_aprobacion: boolean; usa_sedes: boolean } | null>(null);
  const [showSpecialForm, setShowSpecialForm] = useState(false);
  const [specialDraft, setSpecialDraft] = useState({
    nombre_producto: '',
    cantidad: 1,
    unidad: 'und',
    referencia_cliente: '',
    comentarios_item: '',
  });
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
    (sum, item) => sum + (item.tipo_item === 'catalogo' ? item.precio_unitario_cop * item.cantidad : 0),
    0
  );

  const categorias = [...new Set(items.map((item) => item.tipo_item === 'especial' ? 'productos especiales' : item.categoria || 'sin categoría'))];
  const hasSpecialItems = items.some((item) => item.tipo_item === 'especial');

  const requiereAprobacion = empresaConfig?.requiere_aprobacion ?? true;
  const ctaTexto = requiereAprobacion ? 'Enviar a Aprobación' : 'Enviar Pedido';
  const ayudaTexto = requiereAprobacion
    ? 'El pedido será revisado por el gerente de tu empresa'
    : 'El pedido se registrará como aprobado y pasará a validación de Imprima';

  const resetSpecialDraft = () => {
    setSpecialDraft({
      nombre_producto: '',
      cantidad: 1,
      unidad: 'und',
      referencia_cliente: '',
      comentarios_item: '',
    });
  };

  const handleAddSpecialItem = () => {
    if (!specialDraft.nombre_producto.trim()) {
      alert('Describe el producto especial que necesitas.');
      return;
    }

    if (!Number.isFinite(specialDraft.cantidad) || specialDraft.cantidad <= 0) {
      alert('La cantidad del producto especial debe ser mayor a cero.');
      return;
    }

    addSpecialItem({
      nombre_producto: specialDraft.nombre_producto,
      cantidad: specialDraft.cantidad,
      unidad: specialDraft.unidad,
      referencia_cliente: specialDraft.referencia_cliente,
      comentarios_item: specialDraft.comentarios_item,
    });
    resetSpecialDraft();
    setShowSpecialForm(false);
  };

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
            tipo_item: item.tipo_item,
            odoo_product_id: item.odoo_product_id,
            odoo_variant_id: item.odoo_variant_id || null,
            nombre_producto: item.nombre_producto,
            cantidad: item.cantidad,
            precio_unitario_cop: item.precio_unitario_cop,
            unidad: item.unidad || null,
            referencia_cliente: item.referencia_cliente || null,
            comentarios_item: item.comentarios_item || null,
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
          <p className="text-muted text-sm mt-1">Revisión de productos seleccionados y solicitudes especiales</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-border mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Tu carrito está vacío</h2>
          <p className="text-sm text-muted mb-6">Agrega productos desde el catálogo o solicita uno especial dentro del mismo pedido</p>
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
              key={item.id}
              className="bg-white rounded-xl border border-border p-4 flex gap-4"
            >
              <div className="w-16 h-16 bg-background-light rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                {item.imagen_url ? (
                  <img
                    src={item.imagen_url}
                    alt={item.nombre_producto}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ShoppingBag className="w-6 h-6 text-muted" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {item.tipo_item === 'catalogo' && item.odoo_product_id ? (
                      <p className="text-xs text-muted">ID Odoo: {item.odoo_product_id}</p>
                    ) : (
                      <p className="text-xs text-amber-700 font-medium">Producto especial</p>
                    )}
                    <h3 className="text-sm font-semibold text-foreground">{item.nombre_producto}</h3>
                    {item.variante_label && (
                      <p className="text-xs text-primary font-medium mt-0.5">{item.variante_label}</p>
                    )}
                    {item.tipo_item === 'catalogo' && showPrices && (
                      <p className="text-sm text-muted mt-0.5">
                        {formatCOP(item.precio_unitario_cop)} / {item.unidad || 'und'}
                      </p>
                    )}
                    {item.tipo_item === 'especial' && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-sm text-muted">{item.unidad ? `Unidad: ${item.unidad}` : 'Pendiente por cotizar'}</p>
                        {item.referencia_cliente && (
                          <p className="text-xs text-muted">Referencia cliente: {item.referencia_cliente}</p>
                        )}
                        {item.comentarios_item && (
                          <p className="text-xs text-muted">Comentarios: {item.comentarios_item}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-semibold w-10 text-center">{item.cantidad}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-background-light transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  {showPrices && (
                    item.tipo_item === 'catalogo' ? (
                      <p className="text-sm font-bold text-foreground">
                        {formatCOP(item.precio_unitario_cop * item.cantidad)}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-amber-700">Por cotizar</p>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="bg-white rounded-xl border border-dashed border-primary/30 p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">¿No encuentras un producto?</h2>
                <p className="text-sm text-muted mt-1">Agrégalo aquí y viajará dentro de la misma cotización como producto especial.</p>
              </div>
              <button
                onClick={() => setShowSpecialForm((prev) => !prev)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {showSpecialForm ? 'Cerrar formulario' : 'Agregar producto especial'}
              </button>
            </div>

            {showSpecialForm && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Descripción del producto especial
                  </label>
                  <textarea
                    value={specialDraft.nombre_producto}
                    onChange={(e) => setSpecialDraft((prev) => ({ ...prev, nombre_producto: e.target.value }))}
                    placeholder="Describe lo que necesita tu empresa: marca, presentación, material o especificación clave"
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={specialDraft.cantidad}
                    onChange={(e) => setSpecialDraft((prev) => ({ ...prev, cantidad: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={specialDraft.unidad}
                    onChange={(e) => setSpecialDraft((prev) => ({ ...prev, unidad: e.target.value }))}
                    placeholder="und, caja, paquete..."
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Referencia del cliente
                  </label>
                  <input
                    type="text"
                    value={specialDraft.referencia_cliente}
                    onChange={(e) => setSpecialDraft((prev) => ({ ...prev, referencia_cliente: e.target.value }))}
                    placeholder="Código interno, marca o referencia"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Comentarios
                  </label>
                  <input
                    type="text"
                    value={specialDraft.comentarios_item}
                    onChange={(e) => setSpecialDraft((prev) => ({ ...prev, comentarios_item: e.target.value }))}
                    placeholder="Color, urgencia, condición o detalle adicional"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      resetSpecialDraft();
                      setShowSpecialForm(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddSpecialItem}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar al pedido
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resumen del pedido */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-5 sticky top-20">
            <h2 className="font-semibold text-foreground mb-4">Resumen del Pedido</h2>

            {/* Categorías */}
            <div className="space-y-2 mb-4">
              {categorias.map((cat) => {
                const catItems = items.filter((i) => (i.tipo_item === 'especial' ? 'productos especiales' : i.categoria || 'sin categoría') === cat);
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
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted">Total Estimado Catálogo</span>
                <span className="font-bold text-lg text-primary">{formatCOP(totalPrecio)}</span>
              </div>
              {hasSpecialItems && (
                <p className="mt-2 text-xs text-amber-700">
                  Los productos especiales se enviarán en la misma cotización, pero se cotizan aparte y no están incluidos en el total estimado.
                </p>
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
