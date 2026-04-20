'use client';

import { createContext, useContext } from 'react';
import type { CmsSeccionesCtx } from './_hooks/useCmsSecciones';

const CmsContext = createContext<CmsSeccionesCtx | null>(null);

export function CmsProvider({
  value,
  children,
}: {
  value: CmsSeccionesCtx;
  children: React.ReactNode;
}) {
  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>;
}

export function useCmsCtx(): CmsSeccionesCtx {
  const ctx = useContext(CmsContext);
  if (!ctx) throw new Error('useCmsCtx debe usarse dentro de <CmsProvider>');
  return ctx;
}
