import type { Metadata } from 'next';
import PublicLayout from '@/components/public/PublicLayout';
import { getSeccion, LANDING_CACHE_REVALIDATE } from '@/lib/landing/getContenido';

export const revalidate = LANDING_CACHE_REVALIDATE;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeccion('pagina_privacidad');
  return {
    title: s?.titulo ? `${s.titulo} | Imprima` : 'Política de Privacidad | Imprima',
    description: 'Política de privacidad y protección de datos de Imprima.',
  };
}

export default async function PrivacidadPage() {
  const s = await getSeccion('pagina_privacidad');

  if (!s) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p className="text-slate-500">Contenido no disponible.</p>
        </div>
      </PublicLayout>
    );
  }

  const cuerpo = (s.contenido.cuerpo as string) || '';

  return (
    <PublicLayout>
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight mb-8 text-center">{s.titulo}</h1>
          {cuerpo ? (
            <div className="prose prose-lg max-w-none text-slate-600 whitespace-pre-line">{cuerpo}</div>
          ) : (
            <p className="text-center text-slate-400">Próximamente publicaremos nuestra política de privacidad.</p>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
