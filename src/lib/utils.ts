import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
