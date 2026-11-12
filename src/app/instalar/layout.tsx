import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Instalar Imprima B2B',
  description: 'Guía para instalar el portal Imprima B2B en iPhone, Android o computador y activar las notificaciones.',
  robots: { index: false, follow: false },
};

export default function InstalarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
