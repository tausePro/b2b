import { notFound } from 'next/navigation';
import GerenciaFinanzas from '@/components/dashboards/GerenciaFinanzas';

export default async function AsesoraFinanzasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'none') return <GerenciaFinanzas advisorId={null} />;
  const advisorId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(advisorId)) notFound();
  return <GerenciaFinanzas advisorId={advisorId} />;
}
