import GerenciaFinanzas from '@/components/dashboards/GerenciaFinanzas';
import GerenciaTabs from '@/components/dashboards/GerenciaTabs';

export default function GerenciaPage() {
  return (
    <div className="space-y-6">
      <GerenciaTabs />
      <GerenciaFinanzas />
    </div>
  );
}
