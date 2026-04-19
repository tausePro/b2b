import type { Metadata } from 'next';
import PublicLayout from '@/components/public/PublicLayout';
import { getSeccion } from '@/lib/landing/getContenido';

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeccion('pagina_terminos');
  return {
    title: s?.titulo ? `${s.titulo} | Imprima` : 'Términos y Condiciones | Imprima',
    description: 'Términos y condiciones de uso de Imprima.',
  };
}

export default async function TerminosPage() {
  const s = await getSeccion('pagina_terminos');

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
            <p className="text-center text-slate-400">Próximamente publicaremos nuestros términos y condiciones.</p>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
