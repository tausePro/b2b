import type { PedidoItem, TipoPedidoItem } from '@/types';

export type PedidoItemSerializable = Pick<
  PedidoItem,
  | 'tipo_item'
  | 'odoo_product_id'
  | 'nombre_producto'
  | 'cantidad'
  | 'precio_unitario_cop'
  | 'unidad'
  | 'referencia_cliente'
  | 'comentarios_item'
>;

export function normalizeTipoPedidoItem(value: unknown): TipoPedidoItem {
  return value === 'especial' ? 'especial' : 'catalogo';
}

export function partitionPedidoItems<T extends PedidoItemSerializable>(items: T[]) {
  return {
    catalogItems: items.filter((item) => item.tipo_item === 'catalogo'),
    specialItems: items.filter((item) => item.tipo_item === 'especial'),
  };
}

export function buildSpecialItemsNote(items: PedidoItemSerializable[]): string | null {
  if (items.length === 0) {
    return null;
  }

  const sections = items.map((item, index) => {
    const lines = [
      `${index + 1}. ${item.nombre_producto.trim()}`,
      `Cantidad: ${item.cantidad}`,
      item.unidad?.trim() ? `Unidad: ${item.unidad.trim()}` : null,
      item.referencia_cliente?.trim() ? `Referencia cliente: ${item.referencia_cliente.trim()}` : null,
      item.comentarios_item?.trim() ? `Comentarios: ${item.comentarios_item.trim()}` : null,
    ].filter((value): value is string => Boolean(value));

    return lines.join('\n');
  });

  return ['Productos especiales solicitados:', ...sections].join('\n\n');
}

export function mergePedidoNoteWithSpecialItems(
  baseNote: string | null | undefined,
  items: PedidoItemSerializable[]
): string | null {
  const specialNote = buildSpecialItemsNote(items);
  const normalizedBaseNote = baseNote?.trim() || null;

  if (!specialNote) {
    return normalizedBaseNote;
  }

  if (!normalizedBaseNote) {
    return specialNote;
  }

  return `${normalizedBaseNote}\n\n${specialNote}`;
}
