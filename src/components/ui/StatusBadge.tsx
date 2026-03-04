'use client';

import { getEstadoColor, getEstadoLabel } from '@/lib/utils';

interface StatusBadgeProps {
  estado: string;
}

export default function StatusBadge({ estado }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getEstadoColor(estado)}`}>
      {getEstadoLabel(estado)}
    </span>
  );
}
