'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import type { CartItem } from '@/contexts/CartContext';
import { createClient } from '@/lib/supabase/client';
import { formatCOP, formatDateTime } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ArrowLeft,
  Printer,
  Check,
  X,
  Loader2,
  MapPin,
  User,
  Phone,
  Clock,
  FileText,
  Package,
  Trash2,
  Pencil,
  Save,
  Undo2,
  Plus,
  Search,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface PedidoDetalle {
  id: string;
  numero: string;
  estado: string;
  empresa_id: string;
  odoo_sale_order_id: number | null;
  valor_total_cop: number;
  total_items: number;
  comentarios_sede: string | null;
  comentarios_aprobador: string | null;
  excede_presupuesto: boolean;
  justificacion_exceso: string | null;
  fecha_creacion: string;
  updated_at: string;
  fecha_aprobacion: string | null;
  fecha_validacion: string | null;
  empresa: { nombre: string } | null;
  sede: { nombre_sede: string; direccion: string; ciudad: string; contacto_nombre: string; contacto_telefono: string } | null;
  creador: { nombre: string; apellido: string; email: string } | null;
}

interface ItemDetalle {
  id: string;
  tipo_item: 'catalogo' | 'especial';
  odoo_product_id: number | null;
  odoo_variant_id?: number | null;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
  subtotal_cop: number;
  unidad?: string | null;
  referencia_cliente?: string | null;
  comentarios_item?: string | null;
}

interface LogEntry {
  id: string;
  accion: string;
  descripcion: string;
  usuario_nombre: string;
  created_at: string;
}

interface NewItemLocal {
  tempId: string;
  tipo_item: 'catalogo' | 'especial';
  odoo_product_id: number | null;
  nombre_producto: string;
  cantidad: number;
  precio_unitario_cop: number;
  unidad?: string | null;
  referencia_cliente?: string | null;
  comentarios_item?: string | null;
}

interface SpecialDraftState {
  nombre_producto: string;
  cantidad: number;
  unidad: string;
  referencia_cliente: string;
  comentarios_item: string;
}

interface OdooProductSearch {
  id: number;
  name: string;
  list_price: number;
  categ_id: [number, string];
  image_128: string | false;
}

interface OdooSaleOrderSummary {
  id: number;
  name: string | null;
  state: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  currencyName: string | null;
}

const INITIAL_SPECIAL_DRAFT: SpecialDraftState = {
  nombre_producto: '',
  cantidad: 1,
  unidad: 'und',
  referencia_cliente: '',
  comentarios_item: '',
};

export default function DetallePedidoPage() {
  const { user, showPrices } = useAuth();
  const { replaceAllItems, items: cartItems } = useCart();
  const params = useParams();
  const router = useRouter();
  const pedidoId = params.id as string;

  const [pedido, setPedido] = useState<PedidoDetalle | null>(null);
  const [items, setItems] = useState<ItemDetalle[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [odooSummary, setOdooSummary] = useState<OdooSaleOrderSummary | null>(null);
  const [loadingOdooSummary, setLoadingOdooSummary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<Record<string, { cantidad: number; eliminar: boolean }>>({});
  const [editComment, setEditComment] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newItems, setNewItems] = useState<NewItemLocal[]>([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showSpecialForm, setShowSpecialForm] = useState(false);
  const [searchProducts, setSearchProducts] = useState<OdooProductSearch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [specialDraft, setSpecialDraft] = useState<SpecialDraftState>(INITIAL_SPECIAL_DRAFT);
  const [supabase] = useState(() => createClient());

  const fetchOdooSummary = useCallback(async (targetPedidoId: string) => {
    setLoadingOdooSummary(true);

    try {
      const response = await fetch(`/api/pedidos/${targetPedidoId}/odoo-resumen`);
      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setOdooSummary(null);
          return;
        }
        throw new Error(payload.details || payload.error || 'No se pudo cargar el resumen de Odoo.');
      }

      setOdooSummary((payload.odoo_sale_order || null) as OdooSaleOrderSummary | null);
    } catch (error) {
      console.error('Error cargando resumen de Odoo:', error);
      setOdooSummary(null);
    } finally {
      setLoadingOdooSummary(false);
    }
  }, []);

  const fetchPedido = useCallback(async () => {
    setLoading(true);

    const [pedidoRes, itemsRes, logsRes] = await Promise.all([
      supabase
        .from('pedidos')
        .select(`
          id, numero, estado, empresa_id, odoo_sale_order_id, valor_total_cop, total_items, comentarios_sede, comentarios_aprobador,
          excede_presupuesto, justificacion_exceso, fecha_creacion, updated_at,
          fecha_aprobacion, fecha_validacion,
          empresa:empresas(nombre),
          sede:sedes(nombre_sede, direccion, ciudad, contacto_nombre, contacto_telefono),
          creador:usuarios!pedidos_usuario_creador_id_fkey(nombre, apellido, email)
        `)
        .eq('id', pedidoId)
        .single(),
      supabase
        .from('pedido_items')
        .select('id, tipo_item, odoo_product_id, odoo_variant_id, nombre_producto, cantidad, precio_unitario_cop, subtotal_cop, unidad, referencia_cliente, comentarios_item')
        .eq('pedido_id', pedidoId)
        .order('created_at'),
      supabase
        .from('logs_trazabilidad')
        .select('id, accion, descripcion, usuario_nombre, created_at')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false }),
    ]);

    if (pedidoRes.data) {
      const pedidoData = pedidoRes.data as unknown as PedidoDetalle;
      setPedido(pedidoData);

      if (pedidoData.odoo_sale_order_id) {
        await fetchOdooSummary(pedidoData.id);
      } else {
        setOdooSummary(null);
        setLoadingOdooSummary(false);
      }
    } else {
      setOdooSummary(null);
      setLoadingOdooSummary(false);
    }

    if (itemsRes.data) setItems(itemsRes.data as unknown as ItemDetalle[]);
    if (logsRes.data) setLogs(logsRes.data as LogEntry[]);

    setLoading(false);
  }, [fetchOdooSummary, pedidoId, supabase]);

  useEffect(() => {
    fetchPedido();
  }, [fetchPedido]);

  const handleAction = async (accion: 'aprobar' | 'rechazar' | 'validar') => {
    if (!user || !pedido) return;
    setProcesando(true);

    try {
      const response = await fetch(`/api/pedidos/${pedido.id}/${accion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.details || payload.error || `No se pudo ${accion} el pedido.`);
      }

      if (payload.warning) {
        console.warn(`[DetallePedido] Advertencia en ${accion}:`, payload.warning);
      }

      await fetchPedido();
    } catch (error) {
      console.error(`Error en acción ${accion}:`, error);
      alert(error instanceof Error ? error.message : `No se pudo ${accion} el pedido.`);
    } finally {
      setProcesando(false);
    }
  };

  const handleDelete = async () => {
    if (!pedido) return;
    const confirmed = window.confirm(
      `¿Estás seguro de eliminar el pedido ${pedido.numero}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/pedidos/${pedido.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'No se pudo eliminar el pedido.');
      }
      router.push('/dashboard/pedidos');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo eliminar el pedido.');
    } finally {
      setDeleting(false);
    }
  };

  const fetchProductosParaAgregar = async () => {
    if (!pedido) return;
    setLoadingProducts(true);
    try {
      // Obtener odoo_partner_id de la empresa del pedido
      const empresaId = user?.empresa_id || pedido.empresa_id;
      if (!empresaId) throw new Error('No se pudo determinar la empresa');

      const { data: empresa } = await supabase
        .from('empresas')
        .select('odoo_partner_id')
        .eq('id', empresaId)
        .single();

      if (!empresa?.odoo_partner_id) throw new Error('Empresa sin partner Odoo');

      const res = await fetch(`/api/odoo/productos?partner_id=${empresa.odoo_partner_id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error cargando productos');

      setSearchProducts((data.productos || []) as OdooProductSearch[]);
    } catch (err) {
      console.error('Error cargando productos:', err);
      setSearchProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const resetSpecialDraft = () => {
    setSpecialDraft({ ...INITIAL_SPECIAL_DRAFT });
  };

  const handleAddNewItem = (product: OdooProductSearch) => {
    // Verificar que no esté ya en items existentes o nuevos
    const alreadyExists = items.some((i) => i.odoo_product_id === product.id) ||
      newItems.some((ni) => ni.odoo_product_id === product.id);
    if (alreadyExists) return;

    setNewItems((prev) => [
      ...prev,
      {
        tempId: `new-${Date.now()}-${product.id}`,
        tipo_item: 'catalogo',
        odoo_product_id: product.id,
        nombre_producto: product.name,
        cantidad: 1,
        precio_unitario_cop: product.list_price,
        unidad: null,
        referencia_cliente: null,
        comentarios_item: null,
      },
    ]);
  };

  const handleAddSpecialItem = () => {
    if (!specialDraft.nombre_producto.trim()) {
      alert('Describe el producto especial que deseas agregar.');
      return;
    }

    if (!Number.isFinite(specialDraft.cantidad) || specialDraft.cantidad <= 0) {
      alert('La cantidad del producto especial debe ser mayor a cero.');
      return;
    }

    setNewItems((prev) => [
      ...prev,
      {
        tempId: globalThis.crypto?.randomUUID?.() ?? `new-special-${Date.now()}`,
        tipo_item: 'especial',
        odoo_product_id: null,
        nombre_producto: specialDraft.nombre_producto.trim(),
        cantidad: specialDraft.cantidad,
        precio_unitario_cop: 0,
        unidad: specialDraft.unidad.trim() || null,
        referencia_cliente: specialDraft.referencia_cliente.trim() || null,
        comentarios_item: specialDraft.comentarios_item.trim() || null,
      },
    ]);

    resetSpecialDraft();
    setShowSpecialForm(false);
  };

  const enterEditMode = () => {
    const initial: Record<string, { cantidad: number; eliminar: boolean }> = {};
    items.forEach((item) => {
      initial[item.id] = { cantidad: item.cantidad, eliminar: false };
    });
    setEditedItems(initial);
    setEditComment(pedido?.comentarios_aprobador || '');
    setEditMode(true);
  };

  const cancelEditMode = () => {
    setEditMode(false);
    setEditedItems({});
    setEditComment('');
    setNewItems([]);
    setShowProductSearch(false);
    setShowSpecialForm(false);
    setSearchQuery('');
    resetSpecialDraft();
  };

  const handleSaveEdit = async () => {
    if (!pedido) return;
    setSavingEdit(true);
    try {
      const changedItems = Object.entries(editedItems)
        .filter(([id, edit]) => {
          const original = items.find((i) => i.id === id);
          if (!original) return false;
          return edit.eliminar || edit.cantidad !== original.cantidad;
        })
        .map(([id, edit]) => ({
          id,
          ...(edit.eliminar ? { eliminar: true } : { cantidad: edit.cantidad }),
        }));

      const activeItems = Object.values(editedItems).filter((e) => !e.eliminar);
      if (activeItems.length === 0 && newItems.length === 0) {
        alert('El pedido debe tener al menos un ítem.');
        setSavingEdit(false);
        return;
      }

      const newItemsPayload = newItems.map((ni) => ({
        tipo_item: ni.tipo_item,
        odoo_product_id: ni.odoo_product_id,
        nombre_producto: ni.nombre_producto,
        cantidad: ni.cantidad,
        precio_unitario_cop: ni.precio_unitario_cop,
        unidad: ni.unidad || null,
        referencia_cliente: ni.referencia_cliente || null,
        comentarios_item: ni.comentarios_item || null,
      }));

      const body: Record<string, unknown> = { items: changedItems };
      if (newItemsPayload.length > 0) {
        body.newItems = newItemsPayload;
      }
      if (editComment !== (pedido.comentarios_aprobador || '')) {
        body.comentarios_aprobador = editComment;
      }

      if (changedItems.length === 0 && newItemsPayload.length === 0 && !body.comentarios_aprobador) {
        setEditMode(false);
        setSavingEdit(false);
        return;
      }

      const response = await fetch(`/api/pedidos/${pedido.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'No se pudo guardar los cambios.');
      }
      setEditMode(false);
      setEditedItems({});
      setNewItems([]);
      setShowProductSearch(false);
      setShowSpecialForm(false);
      setSearchQuery('');
      resetSpecialDraft();
      await fetchPedido();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo guardar los cambios.');
    } finally {
      setSavingEdit(false);
    }
  };

  const [reordering, setReordering] = useState(false);

  const handleReorder = async () => {
    if (!pedido || items.length === 0 || !user?.empresa_id) return;

    if (cartItems.length > 0) {
      const confirmed = window.confirm(
        'Ya tienes productos en el carrito. ¿Deseas reemplazarlos con los de este pedido?'
      );
      if (!confirmed) return;
    }

    setReordering(true);

    try {
      // 1. Obtener partner_id de la empresa para traer precios actualizados
      const { data: empresa } = await supabase
        .from('empresas')
        .select('odoo_partner_id')
        .eq('id', user.empresa_id)
        .single();

      // 2. Traer precios actuales del catálogo (con margen aplicado)
      const priceMap = new Map<number, number>(); // odoo_product_id → list_price
      if (empresa?.odoo_partner_id) {
        const res = await fetch(`/api/odoo/productos?partner_id=${empresa.odoo_partner_id}&limit=500`);
        if (res.ok) {
          const data = await res.json();
          for (const p of (data.productos || []) as { id: number; list_price: number }[]) {
            priceMap.set(p.id, p.list_price);
          }
        }
      }

      // 3. Para variantes, traer precios actualizados por template
      const variantPriceMap = new Map<number, number>(); // odoo_variant_id → lst_price
      const variantItems = items.filter((i) => i.tipo_item === 'catalogo' && i.odoo_variant_id);
      const uniqueTemplateIds = [...new Set(variantItems.map((i) => i.odoo_product_id!))];

      for (const templateId of uniqueTemplateIds) {
        try {
          const vRes = await fetch(`/api/odoo/productos/${templateId}/variantes`);
          if (vRes.ok) {
            const vData = await vRes.json();
            for (const v of (vData.variants || []) as { id: number; lst_price: number }[]) {
              variantPriceMap.set(v.id, v.lst_price);
            }
          }
        } catch {
          // si falla un fetch de variantes, seguimos con el resto
        }
      }

      // 4. Construir carrito con precios frescos
      const newCartItems: CartItem[] = items.map((item) => {
        if (item.tipo_item === 'especial') {
          return {
            id: globalThis.crypto?.randomUUID?.() ?? `especial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            tipo_item: 'especial' as const,
            odoo_product_id: null,
            nombre_producto: item.nombre_producto,
            precio_unitario_cop: 0,
            unidad: item.unidad || null,
            referencia_cliente: item.referencia_cliente || null,
            comentarios_item: item.comentarios_item || null,
            cantidad: item.cantidad,
          };
        }

        if (item.odoo_variant_id) {
          const freshPrice = variantPriceMap.get(item.odoo_variant_id)
            ?? priceMap.get(item.odoo_product_id!)
            ?? item.precio_unitario_cop;
          return {
            id: `variante:${item.odoo_variant_id}`,
            tipo_item: 'catalogo' as const,
            odoo_product_id: item.odoo_product_id,
            odoo_variant_id: item.odoo_variant_id,
            nombre_producto: item.nombre_producto,
            precio_unitario_cop: freshPrice,
            unidad: item.unidad || null,
            cantidad: item.cantidad,
          };
        }

        const freshPrice = priceMap.get(item.odoo_product_id!) ?? item.precio_unitario_cop;
        return {
          id: `catalogo:${item.odoo_product_id}`,
          tipo_item: 'catalogo' as const,
          odoo_product_id: item.odoo_product_id,
          nombre_producto: item.nombre_producto,
          precio_unitario_cop: freshPrice,
          unidad: item.unidad || null,
          cantidad: item.cantidad,
        };
      });

      replaceAllItems(newCartItems);
      router.push('/dashboard/carrito');
    } catch (err) {
      console.error('[Reorder] Error:', err);
      alert('Error al preparar el pedido. Intenta de nuevo.');
    } finally {
      setReordering(false);
    }
  };

  const getAccionIcon = (accion: string) => {
    switch (accion) {
      case 'creacion': return <Package className="w-4 h-4 text-info" />;
      case 'edicion': return <Pencil className="w-4 h-4 text-warning" />;
      case 'aprobacion': case 'aprobar': return <Check className="w-4 h-4 text-success" />;
      case 'rechazo': case 'rechazar': return <X className="w-4 h-4 text-danger" />;
      case 'validacion': case 'validar': return <Check className="w-4 h-4 text-primary" />;
      default: return <Clock className="w-4 h-4 text-muted" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">Pedido no encontrado.</p>
        <Link href="/dashboard/pedidos" className="text-primary hover:text-primary-dark text-sm font-medium mt-2 inline-block">
          Volver a pedidos
        </Link>
      </div>
    );
  }

  const canApprove = user?.rol === 'aprobador' && pedido.estado === 'en_aprobacion';
  const canEdit = (user?.rol === 'aprobador' || user?.rol === 'super_admin') && pedido.estado === 'en_aprobacion';
  const canDelete = user?.rol === 'super_admin';
  const canValidate = user?.rol === 'asesor' && pedido.estado === 'aprobado' && !pedido.odoo_sale_order_id;
  const estadoVisual = pedido.estado;
  const subtotalVisual = odooSummary?.amountUntaxed ?? pedido.valor_total_cop;
  const subtotalEdicionVisual = editMode
    ? items.reduce((sum, item) => {
        const editState = editedItems[item.id];

        if (editState?.eliminar) {
          return sum;
        }

        const cantidad = editState?.cantidad ?? item.cantidad;
        return sum + (item.tipo_item === 'catalogo' ? cantidad * item.precio_unitario_cop : 0);
      }, 0) + newItems.reduce((sum, item) => {
        return sum + (item.tipo_item === 'catalogo' ? item.cantidad * item.precio_unitario_cop : 0);
      }, 0)
    : subtotalVisual;
  const totalItemsVisual = editMode
    ? items.reduce((sum, item) => {
        const editState = editedItems[item.id];

        if (editState?.eliminar) {
          return sum;
        }

        return sum + (editState?.cantidad ?? item.cantidad);
      }, 0) + newItems.reduce((sum, item) => sum + item.cantidad, 0)
    : pedido.total_items;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-white border border-border transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{pedido.numero}</h1>
              <StatusBadge estado={estadoVisual} />
            </div>
            <p className="text-muted text-sm mt-0.5">
              Creado el {formatDateTime(pedido.fecha_creacion)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editMode && items.length > 0 && (
            <button
              onClick={handleReorder}
              disabled={reordering}
              className="inline-flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {reordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {reordering ? 'Cargando precios...' : 'Volver a pedir'}
            </button>
          )}
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-white transition-colors">
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          {canDelete && !editMode && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger rounded-lg text-sm font-medium hover:bg-danger hover:text-white transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Eliminar
            </button>
          )}
          {canEdit && !editMode && (
            <button
              onClick={enterEditMode}
              className="inline-flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Editar
            </button>
          )}
          {editMode && (
            <>
              <button
                onClick={cancelEditMode}
                disabled={savingEdit}
                className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
              >
                <Undo2 className="w-4 h-4" />
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Cambios
              </button>
            </>
          )}
          {canApprove && !editMode && (
            <>
              <button
                onClick={() => handleAction('rechazar')}
                disabled={procesando}
                className="inline-flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger rounded-lg text-sm font-medium hover:bg-danger hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Rechazar
              </button>
              <button
                onClick={() => handleAction('aprobar')}
                disabled={procesando}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Aprobar Pedido
              </button>
            </>
          )}
          {canValidate && !editMode && (
            <button
              onClick={() => handleAction('validar')}
              disabled={procesando}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Validar Pedido
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items del pedido */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Productos del Pedido</h2>
              <p className="text-xs text-muted mt-0.5">{totalItemsVisual} items</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background-light/50">
                    <th className="text-left py-3 px-4 font-medium text-muted">Producto</th>
                    <th className="text-left py-3 px-4 font-medium text-muted">Categoría</th>
                    <th className="text-center py-3 px-4 font-medium text-muted">Cantidad</th>
                    {showPrices && (
                      <>
                        <th className="text-right py-3 px-4 font-medium text-muted">P. Unitario</th>
                        <th className="text-right py-3 px-4 font-medium text-muted">Subtotal</th>
                      </>
                    )}
                    {editMode && <th className="text-center py-3 px-4 font-medium text-muted w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const editState = editedItems[item.id];
                    const isMarkedForDeletion = editState?.eliminar === true;
                    const currentQty = editState?.cantidad ?? item.cantidad;
                    const currentSubtotal = currentQty * item.precio_unitario_cop;

                    return (
                      <tr key={item.id} className={`border-b border-border/50 ${isMarkedForDeletion ? 'opacity-30 line-through' : ''}`}>
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{item.nombre_producto}</p>
                          {item.tipo_item === 'catalogo' && item.odoo_product_id ? (
                            <p className="text-xs text-muted">Odoo ID: {item.odoo_product_id}</p>
                          ) : (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-xs font-medium text-amber-700">Producto especial</p>
                              {item.unidad && <p className="text-xs text-muted">Unidad: {item.unidad}</p>}
                              {item.referencia_cliente && <p className="text-xs text-muted">Referencia cliente: {item.referencia_cliente}</p>}
                              {item.comentarios_item && <p className="text-xs text-muted">Comentarios: {item.comentarios_item}</p>}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${item.tipo_item === 'especial' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                            {item.tipo_item === 'especial' ? 'Especial' : 'Producto'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-medium">
                          {editMode && !isMarkedForDeletion ? (
                            <input
                              type="number"
                              min={1}
                              value={currentQty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (val > 0) {
                                  setEditedItems((prev) => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], cantidad: val },
                                  }));
                                }
                              }}
                              className="w-20 rounded-lg border border-border bg-white px-2 py-1 text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                            />
                          ) : (
                            currentQty
                          )}
                        </td>
                        {showPrices && (
                          <>
                            <td className="py-3 px-4 text-right text-muted">
                              {item.tipo_item === 'especial' ? 'Por cotizar' : formatCOP(item.precio_unitario_cop)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">
                              {item.tipo_item === 'especial' ? 'Por cotizar' : formatCOP(editMode ? currentSubtotal : item.subtotal_cop)}
                            </td>
                          </>
                        )}
                        {editMode && (
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                setEditedItems((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], eliminar: !isMarkedForDeletion },
                                }));
                              }}
                              className={`p-1 rounded transition-colors ${
                                isMarkedForDeletion
                                  ? 'text-primary hover:bg-primary/10'
                                  : 'text-danger hover:bg-danger/10'
                              }`}
                              title={isMarkedForDeletion ? 'Restaurar item' : 'Eliminar item'}
                            >
                              {isMarkedForDeletion ? <Undo2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {editMode && newItems.map((ni) => (
                    <tr key={ni.tempId} className={`border-b border-border/50 ${ni.tipo_item === 'especial' ? 'bg-amber-50/60' : 'bg-green-50/50'}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded font-semibold uppercase">Nuevo</span>
                          <div>
                            <p className="font-medium text-foreground">{ni.nombre_producto}</p>
                            {ni.tipo_item === 'catalogo' && ni.odoo_product_id ? (
                              <p className="text-xs text-muted">Odoo ID: {ni.odoo_product_id}</p>
                            ) : (
                              <div className="mt-1 space-y-0.5">
                                <p className="text-xs font-medium text-amber-700">Producto especial</p>
                                {ni.unidad && <p className="text-xs text-muted">Unidad: {ni.unidad}</p>}
                                {ni.referencia_cliente && <p className="text-xs text-muted">Referencia cliente: {ni.referencia_cliente}</p>}
                                {ni.comentarios_item && <p className="text-xs text-muted">Comentarios: {ni.comentarios_item}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ni.tipo_item === 'especial' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                          {ni.tipo_item === 'especial' ? 'Especial' : 'Producto'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min={1}
                          value={ni.cantidad}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (val > 0) {
                              setNewItems((prev) => prev.map((item) =>
                                item.tempId === ni.tempId ? { ...item, cantidad: val } : item
                              ));
                            }
                          }}
                          className="w-20 rounded-lg border border-border bg-white px-2 py-1 text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        />
                      </td>
                      {showPrices && (
                        <>
                          <td className="py-3 px-4 text-right text-muted">
                            {ni.tipo_item === 'especial' ? 'Por cotizar' : formatCOP(ni.precio_unitario_cop)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {ni.tipo_item === 'especial' ? 'Por cotizar' : formatCOP(ni.cantidad * ni.precio_unitario_cop)}
                          </td>
                        </>
                      )}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setNewItems((prev) => prev.filter((item) => item.tempId !== ni.tempId))}
                          className="p-1 rounded transition-colors text-danger hover:bg-danger/10"
                          title="Quitar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {showPrices && (
                  <tfoot>
                    <tr className="bg-background-light/50">
                      <td colSpan={3} />
                      <td className="py-3 px-4 text-right font-semibold text-muted">Subtotal</td>
                      <td className="py-3 px-4 text-right font-bold text-lg text-primary">{formatCOP(subtotalEdicionVisual)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {editMode && (
              <div className="border-t border-border px-5 py-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const nextValue = !showProductSearch;
                      setShowProductSearch(nextValue);
                      if (nextValue && searchProducts.length === 0) {
                        fetchProductosParaAgregar();
                      }
                    }}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showProductSearch ? 'border border-primary bg-primary/5 text-primary' : 'border border-dashed border-primary/40 text-primary hover:bg-primary/5'}`}
                  >
                    <Plus className="w-4 h-4" />
                    {showProductSearch ? 'Ocultar catálogo' : 'Agregar producto de catálogo'}
                  </button>
                  <button
                    onClick={() => {
                      if (showSpecialForm) {
                        resetSpecialDraft();
                      }
                      setShowSpecialForm((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showSpecialForm ? 'border border-amber-300 bg-amber-50 text-amber-800' : 'border border-dashed border-amber-300 text-amber-800 hover:bg-amber-50/70'}`}
                  >
                    <Plus className="w-4 h-4" />
                    {showSpecialForm ? 'Ocultar producto especial' : 'Agregar producto especial'}
                  </button>
                </div>
                {showProductSearch && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Agregar productos del catálogo al pedido</h3>
                      <button
                        onClick={() => { setShowProductSearch(false); setSearchQuery(''); }}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        Cerrar
                      </button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                      <input
                        type="text"
                        placeholder="Buscar producto por nombre..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-lg text-sm text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    {loadingProducts ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted">Cargando catálogo...</span>
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
                        {searchProducts
                          .filter((p) =>
                            !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .filter((p) =>
                            !items.some((i) => i.odoo_product_id === p.id) &&
                            !newItems.some((ni) => ni.odoo_product_id === p.id)
                          )
                          .slice(0, 50)
                          .map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between px-3 py-2 hover:bg-primary/5 transition-colors cursor-pointer"
                              onClick={() => handleAddNewItem(p)}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                                <p className="text-xs text-muted">
                                  {Array.isArray(p.categ_id) ? p.categ_id[1] : ''} · ID: {p.id}
                                  {showPrices && ` · ${formatCOP(p.list_price)}`}
                                </p>
                              </div>
                              <Plus className="w-4 h-4 text-primary shrink-0 ml-2" />
                            </div>
                          ))}
                        {searchProducts.filter((p) =>
                          (!searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
                          !items.some((i) => i.odoo_product_id === p.id) &&
                          !newItems.some((ni) => ni.odoo_product_id === p.id)
                        ).length === 0 && (
                          <p className="text-sm text-muted text-center py-4">
                            {searchQuery ? 'Sin resultados para esta búsqueda' : 'No hay productos disponibles'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {showSpecialForm && (
                  <div className="grid grid-cols-1 gap-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Descripción del producto especial
                      </label>
                      <textarea
                        value={specialDraft.nombre_producto}
                        onChange={(e) => setSpecialDraft((prev) => ({ ...prev, nombre_producto: e.target.value }))}
                        rows={3}
                        placeholder="Describe la referencia, material, marca, presentación o condición requerida"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none"
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
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                        placeholder="Código interno o referencia"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                        placeholder="Urgencia, color, empaque o detalle adicional"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
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
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar especial
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observaciones */}
          {pedido.comentarios_sede && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted" />
                Comentarios de Sede
              </h2>
              <p className="text-sm text-muted">{pedido.comentarios_sede}</p>
            </div>
          )}

          {editMode ? (
            <div className="bg-white rounded-xl border border-primary/30 p-5">
              <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Comentarios del Aprobador
              </h2>
              <textarea
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                rows={3}
                placeholder="Agrega comentarios sobre los cambios realizados..."
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
          ) : pedido.comentarios_aprobador ? (
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted" />
                Comentarios del Aprobador
              </h2>
              <p className="text-sm text-muted">{pedido.comentarios_aprobador}</p>
            </div>
          ) : null}

          {pedido.excede_presupuesto && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-warning">Este pedido excede el presupuesto de la sede</p>
              {pedido.justificacion_exceso && (
                <p className="text-xs text-muted mt-1">Justificación: {pedido.justificacion_exceso}</p>
              )}
            </div>
          )}

          {/* Timeline de trazabilidad */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">Historial y Trazabilidad</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin registros de actividad.</p>
            ) : (
              <div className="space-y-0">
                {logs.map((log, index) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-background-light flex items-center justify-center shrink-0">
                        {getAccionIcon(log.accion)}
                      </div>
                      {index < logs.length - 1 && (
                        <div className="w-px h-full bg-border min-h-[2rem]" />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-foreground">{log.descripcion}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {log.usuario_nombre} — {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Info de entrega */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-3">Información de Entrega</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{pedido.sede?.nombre_sede}</p>
                  <p className="text-xs text-muted">{pedido.sede?.direccion}</p>
                  <p className="text-xs text-muted">{pedido.sede?.ciudad}</p>
                </div>
              </div>
              {pedido.sede?.contacto_nombre && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted shrink-0" />
                  <p className="text-sm text-muted">{pedido.sede.contacto_nombre}</p>
                </div>
              )}
              {pedido.sede?.contacto_telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted shrink-0" />
                  <p className="text-sm text-muted">{pedido.sede.contacto_telefono}</p>
                </div>
              )}
            </div>
          </div>

          {/* Info del solicitante */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-3">Solicitante</h2>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {pedido.creador?.nombre} {pedido.creador?.apellido}
              </p>
              <p className="text-xs text-muted">{pedido.creador?.email}</p>
              <p className="text-xs text-muted">{pedido.empresa?.nombre}</p>
            </div>
          </div>

          {/* Resumen de valores */}
          {showPrices && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-3">Resumen</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-medium">{formatCOP(subtotalEdicionVisual)}</span>
                </div>
              </div>
              {loadingOdooSummary ? (
                <p className="text-xs text-muted mt-3">Cargando impuestos reales desde Odoo...</p>
              ) : odooSummary ? (
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Impuestos</span>
                    <span className="font-medium">{formatCOP(odooSummary.amountTax)}</span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="font-bold text-lg text-primary">{formatCOP(odooSummary.amountTotal)}</span>
                  </div>
                  {odooSummary.name && (
                    <p className="text-xs text-muted">Totales sincronizados desde Odoo ({odooSummary.name}).</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted mt-3">
                  Los impuestos varían por producto y se calculan en Odoo al generar la cotización.
                </p>
              )}
            </div>
          )}

          {/* Estado actual */}
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-3">Estado Actual</h2>
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge estado={estadoVisual} />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <p>Creado: {formatDateTime(pedido.fecha_creacion)}</p>
              {pedido.fecha_aprobacion && <p>Aprobado: {formatDateTime(pedido.fecha_aprobacion)}</p>}
              {pedido.fecha_validacion && <p>Validado: {formatDateTime(pedido.fecha_validacion)}</p>}
              {pedido.odoo_sale_order_id && <p>Cotización Odoo ID: {pedido.odoo_sale_order_id}</p>}
              <p>Última actualización: {formatDateTime(pedido.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
