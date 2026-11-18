import { cn } from '@/lib/utils';

export type PoweredByPlacement = 'login' | 'landing' | 'publico' | 'empaques' | 'instalar';

/** Enlace a tause.co con UTM para medir desde qué ubicación llegan las visitas. */
export const tauseCreditHref = (placement: PoweredByPlacement) =>
  `https://tause.co/?utm_source=imprima&utm_medium=referral&utm_campaign=powered_by&utm_content=${placement}`;

/** Crédito del desarrollo, aprobado por Imprima: solo texto y discreto. */
export default function PoweredByTause({ placement, className }: { placement: PoweredByPlacement; className?: string }) {
  return (
    <p className={cn('text-xs', className)}>
      Powered by{' '}
      <a href={tauseCreditHref(placement)} target="_blank" rel="noopener" className="font-medium underline-offset-2 hover:underline focus-visible:underline">Tause</a>
    </p>
  );
}
