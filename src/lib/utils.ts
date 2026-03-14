import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function expandHexColor(value: string): string {
  const cleaned = value.replace('#', '').trim();
  if (cleaned.length === 3) {
    return `#${cleaned
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`.toUpperCase();
  }
  return `#${cleaned}`.toUpperCase();
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
  const normalized = expandHexColor(value).replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function mixHexColors(base: string, target: string, weight: number): string {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);

  return rgbToHex(
    Math.round(baseRgb.r * (1 - weight) + targetRgb.r * weight),
    Math.round(baseRgb.g * (1 - weight) + targetRgb.g * weight),
    Math.round(baseRgb.b * (1 - weight) + targetRgb.b * weight)
  );
}

export function normalizeHexColor(value?: string | null, fallback = '#9CBB06'): string {
  const normalizedFallback = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(fallback)
    ? expandHexColor(fallback)
    : '#9CBB06';

  if (!value) {
    return normalizedFallback;
  }

  const candidate = value.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) {
    return normalizedFallback;
  }

  return expandHexColor(candidate);
}

export function getBrandingCssVariables(primaryColor?: string | null): Record<string, string> {
  const primary = normalizeHexColor(primaryColor);
  return {
    '--color-primary': primary,
    '--color-primary-dark': mixHexColors(primary, '#000000', 0.2),
    '--color-primary-light': mixHexColors(primary, '#FFFFFF', 0.22),
  };
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateString));
}

export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function getEstadoColor(estado: string): string {
  const colores: Record<string, string> = {
    borrador: 'bg-gray-100 text-gray-700',
    en_aprobacion: 'bg-yellow-100 text-yellow-700',
    aprobado: 'bg-green-100 text-green-700',
    rechazado: 'bg-red-100 text-red-700',
    en_validacion_imprima: 'bg-blue-100 text-blue-700',
    procesado_odoo: 'bg-primary/10 text-primary-dark',
  };
  return colores[estado] || 'bg-gray-100 text-gray-700';
}

export function getEstadoLabel(estado: string): string {
  const labels: Record<string, string> = {
    borrador: 'Borrador',
    en_aprobacion: 'En Aprobación',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    en_validacion_imprima: 'En Validación Imprima',
    procesado_odoo: 'Procesado Odoo',
  };
  return labels[estado] || estado;
}

export function getPedidoEstadoVisual(estado: string, odooSaleOrderId?: number | null): string {
  return odooSaleOrderId ? 'procesado_odoo' : estado;
}

export function isPedidoPendienteComercial(estado: string, odooSaleOrderId?: number | null): boolean {
  if (odooSaleOrderId) {
    return false;
  }

  return ['borrador', 'en_aprobacion', 'aprobado', 'en_validacion_imprima'].includes(estado);
}
