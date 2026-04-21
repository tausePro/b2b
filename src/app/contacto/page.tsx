import type { Metadata } from 'next';
import PublicLayout from '@/components/public/PublicLayout';
import ContactoForm from '@/components/public/ContactoForm';
import LeadButton from '@/components/public/LeadButton';
import ComercialesGrid, { type Comercial } from '@/components/public/ComercialesGrid';
import { getSeccion, getSecciones } from '@/lib/landing/getContenido';
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
  // Traemos pagina_contacto (info basica) y contacto_comerciales (equipo)
  // en paralelo. Si la grilla de comerciales esta vacia o inactiva,
  // <ComercialesGrid> no renderiza nada.
  const data = await getSecciones(['pagina_contacto', 'contacto_comerciales']);
  const s = data.pagina_contacto;
  const comercialesSec = data.contacto_comerciales;
  const comerciales = (comercialesSec?.contenido?.comerciales || []) as Comercial[];
  const comercialesTitulo = comercialesSec?.titulo || 'Nuestro equipo comercial';
  const comercialesSubtitulo = comercialesSec?.subtitulo || '';

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">{s.titulo}</h1>
            {s.subtitulo && <p className="text-lg text-slate-500 max-w-2xl mx-auto">{s.subtitulo}</p>}
          </div>

          {/* Layout en dos columnas a partir de lg: izquierda info de
              contacto + mapa, derecha formulario + CTA WhatsApp. Ambos
              generan leads con fuentes distintas para que /admin/leads
              pueda diferenciar canales. */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Columna izquierda: datos y mapa */}
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {contactItems.map((item, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-border p-5 flex items-start gap-3"
                  >
                    <div className="bg-primary/10 rounded-xl p-2.5 shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        {item.label}
                      </p>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="block text-slate-800 font-medium hover:text-primary transition-colors break-words"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="text-slate-800 font-medium break-words">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA WhatsApp directo: abre el modal con fuente distinta
                  a la del formulario para poder diferenciar canales en
                  el dashboard de leads. */}
              <div className="rounded-2xl border border-green-200 bg-green-50/50 p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">¿Prefieres WhatsApp?</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Respuesta inmediata de un asesor comercial.
                  </p>
                </div>
                <LeadButton
                  fuente="contacto_whatsapp"
                  texto="Hablar por WhatsApp"
                  variant="whatsapp"
                  className="shrink-0"
                />
              </div>

              {mapaEmbedUrl && (
                <div className="rounded-2xl overflow-hidden border border-border">
                  <iframe
                    src={mapaEmbedUrl}
                    className="w-full h-72"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Ubicación Imprima"
                  />
                </div>
              )}
            </div>

            {/* Columna derecha: formulario */}
            <div>
              <ContactoForm />
            </div>
          </div>
        </div>
      </section>

      {/* Grilla del equipo comercial: aparece al final de /contacto solo
          si el admin configuro al menos una comercial en el CMS. Cada
          tarjeta permite contactar directo por WhatsApp a la persona
          (con tracking de lead por comercial via fuente dinamica). */}
      <ComercialesGrid
        titulo={comercialesTitulo}
        subtitulo={comercialesSubtitulo}
        comerciales={comerciales}
      />
    </PublicLayout>
  );
}
