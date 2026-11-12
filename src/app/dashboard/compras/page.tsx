'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ComprasProveedores from '@/components/dashboards/ComprasProveedores';

function ComprasConEnlace() {
  const value = useSearchParams().get('producto');
  const productId = value && /^\d{1,10}$/.test(value) ? Number(value) : null;
  return <ComprasProveedores key={productId ?? 'buscar'} initialProductId={productId} />;
}

export default function ComprasPage() {
  return <Suspense fallback={null}><ComprasConEnlace /></Suspense>;
}
