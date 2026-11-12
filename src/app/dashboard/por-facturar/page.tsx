'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PorFacturar from '@/components/dashboards/PorFacturar';

function PorFacturarConFiltro() {
  const filter = useSearchParams().get('filtro') === 'antiguos' ? 'antiguos' : 'todos';
  return <PorFacturar key={filter} initialFilter={filter} />;
}

export default function PorFacturarPage() {
  return <Suspense fallback={null}><PorFacturarConFiltro /></Suspense>;
}
