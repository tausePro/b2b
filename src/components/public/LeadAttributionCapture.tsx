'use client';

import { useEffect } from 'react';
import { captureLeadAttributionFromUrl } from '@/lib/analytics/leadAttribution';

/**
 * Monta la captura de atribución (gclid + utm) en cuanto el layout
 * público carga. Se ejecuta una sola vez por navegación; si el usuario
 * cambia de página en el mismo tab, la cookie persistida mantiene la
 * atribución original y esta llamada es idempotente.
 *
 * No renderiza nada.
 */
export default function LeadAttributionCapture() {
  useEffect(() => {
    captureLeadAttributionFromUrl();
  }, []);
  return null;
}
