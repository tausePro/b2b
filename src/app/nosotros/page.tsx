import type { Metadata } from 'next';
import PublicLayout from '@/components/public/PublicLayout';
import { getSeccion } from '@/lib/landing/getContenido';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeccion('pagina_nosotros');
  return {
    title: s?.titulo ? `${s.titulo} | Imprima` : 'Sobre Nosotros | Imprima',
    description: s?.subtitulo || 'Conozca nuestra historia y misión.',
  };
}

export default async function NosotrosPage() {
  const s = await getSeccion('pagina_nosotros');

  if (!s) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p className="text-slate-500">Contenido no disponible.</p>
        </div>
      </PublicLayout>
    );
  }

  const c = s.contenido;
  const cuerpo = (c.cuerpo as string) || '';
  const mision = (c.mision as string) || '';
  const vision = (c.vision as string) || '';

  return (
    <PublicLayout>
      <section className="py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">{s.titulo}</h1>
            {s.subtitulo && <p className="text-lg text-slate-500 max-w-2xl mx-auto">{s.subtitulo}</p>}
          </div>

          {s.imagen_url && (
            <div className="mb-12 rounded-2xl overflow-hidden">
              <img src={s.imagen_url} alt={s.titulo || 'Sobre Nosotros'} className="w-full h-64 lg:h-80 object-cover" />
            </div>
          )}

          {cuerpo && (
            <div className="prose prose-lg max-w-none text-slate-600 mb-12 whitespace-pre-line">
              {cuerpo}
            </div>
          )}

          {(mision || vision) && (
            <div className="grid md:grid-cols-2 gap-8">
              {mision && (
                <div className="bg-white rounded-2xl border border-border p-8">
                  <h3 className="text-xl font-bold mb-4 text-primary">Nuestra Misión</h3>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">{mision}</p>
                </div>
              )}
              {vision && (
                <div className="bg-white rounded-2xl border border-border p-8">
                  <h3 className="text-xl font-bold mb-4 text-primary">Nuestra Visión</h3>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">{vision}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
