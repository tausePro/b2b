import type { Metadata } from 'next';
import PublicLayout from '@/components/public/PublicLayout';
import { getSeccion } from '@/lib/landing/getContenido';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSeccion('pagina_contacto');
  return {
    title: s?.titulo ? `${s.titulo} | Imprima` : 'Contacto | Imprima',
    description: s?.subtitulo || 'Estamos aquí para ayudarle.',
  };
}

export default async function ContactoPage() {
  const s = await getSeccion('pagina_contacto');

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
  const telefono = (c.telefono as string) || '';
  const email = (c.email as string) || '';
  const direccion = (c.direccion as string) || '';
  const ciudad = (c.ciudad as string) || '';
  const horario = (c.horario as string) || '';
  const mapaUrlRaw = (c.mapa_url as string) || '';

  // Convertir URL de Google Maps a formato embed
  let mapaEmbedUrl = '';
  if (mapaUrlRaw) {
    if (mapaUrlRaw.includes('/embed')) {
      mapaEmbedUrl = mapaUrlRaw;
    } else {
      // Extraer query de la URL de place o usar la dirección
      const addressQuery = [direccion, ciudad].filter(Boolean).join(', ');
      const q = encodeURIComponent(addressQuery || mapaUrlRaw);
      mapaEmbedUrl = `https://maps.google.com/maps?q=${q}&output=embed&z=16`;
    }
  }

  const contactItems = [
    { icon: Phone, label: 'Teléfono', value: telefono, href: telefono ? `tel:${telefono}` : undefined },
    { icon: Mail, label: 'Email', value: email, href: email ? `mailto:${email}` : undefined },
    { icon: MapPin, label: 'Dirección', value: [direccion, ciudad].filter(Boolean).join(', ') },
    { icon: Clock, label: 'Horario', value: horario },
  ].filter((item) => item.value);

  return (
    <PublicLayout>
      <section className="py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">{s.titulo}</h1>
            {s.subtitulo && <p className="text-lg text-slate-500 max-w-2xl mx-auto">{s.subtitulo}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {contactItems.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl border border-border p-6 flex items-start gap-4">
                <div className="bg-primary/10 rounded-xl p-3">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="text-slate-800 font-medium hover:text-primary transition-colors">{item.value}</a>
                  ) : (
                    <p className="text-slate-800 font-medium">{item.value}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {mapaEmbedUrl && (
            <div className="rounded-2xl overflow-hidden border border-border">
              <iframe
                src={mapaEmbedUrl}
                className="w-full h-80"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación Imprima"
              />
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
