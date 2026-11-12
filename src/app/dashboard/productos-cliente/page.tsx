'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductosCliente from '@/components/dashboards/ProductosCliente';

function ProductosClienteConEnlace() {
  const value = useSearchParams().get('cliente');
  const customerId = value && /^\d{1,10}$/.test(value) ? Number(value) : null;
  return <ProductosCliente key={customerId ?? 'buscar'} initialCustomerId={customerId} />;
}

export default function ProductosClientePage() {
  return <Suspense fallback={null}><ProductosClienteConEnlace /></Suspense>;
}
