import type { Metadata } from 'next';
import PublicLayout from '@/components/public/PublicLayout';
import { getSeccion } from '@/lib/landing/getContenido';
import FaqAccordion from './FaqAccordion';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeccion('pagina_faq');
  return {
    title: s?.titulo ? `${s.titulo} | Imprima` : 'Preguntas Frecuentes | Imprima',
    description: s?.subtitulo || 'Encuentre respuestas a las dudas más comunes.',
  };
}

export default async function FaqPage() {
  const s = await getSeccion('pagina_faq');

  if (!s) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p className="text-slate-500">Contenido no disponible.</p>
        </div>
      </PublicLayout>
    );
  }

  const items = (s.contenido.items || []) as Array<{ pregunta: string; respuesta: string }>;

  return (
    <PublicLayout>
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">{s.titulo}</h1>
            {s.subtitulo && <p className="text-lg text-slate-500 max-w-2xl mx-auto">{s.subtitulo}</p>}
          </div>

          {items.length === 0 ? (
            <p className="text-center text-slate-400">Próximamente agregaremos preguntas frecuentes.</p>
          ) : (
            <FaqAccordion items={items} />
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
