import { Mail, MessageCircle, User } from 'lucide-react';
import LeadButton from '@/components/public/LeadButton';

// Grilla de tarjetas del equipo comercial para /contacto. Cada tarjeta
// muestra foto + nombre + cargo + telefono + email, con botones
// accionables:
//   - WhatsApp: abre el LeadModal con mensaje prefill y redirige al
//     numero de ESA comercial (via numeroOverride), registrando el lead
//     con fuente='contacto_comercial_<id>' para trazabilidad por persona.
//   - Email: mailto directo.
//
// Diseño visual: tarjeta glass sutil con foto circular grande + badge
// de nombre en verde (estilo de la imagen de referencia de Diana).

export interface Comercial {
  id: string;
  nombre: string;
  cargo: string;
  foto_url: string | null;
  telefono: string;
  email: string;
  mensaje_prefill: string;
}

interface Props {
  titulo: string;
  subtitulo: string;
  comerciales: Comercial[];
}

// Deja solo digitos para el override del backend. Tambien vale para
// generar el href="tel:" sin espacios ni "+".
function soloDigitos(v: string): string {
  return (v || '').replace(/\D/g, '');
}

export default function ComercialesGrid({ titulo, subtitulo, comerciales }: Props) {
  // Filtra items incompletos: si no tienen nombre ni foto ni contacto
  // util, no los renderizamos (evita tarjetas vacias cuando el admin
  // esta configurando).
  const items = comerciales.filter(
    (c) => c.nombre?.trim() && (c.telefono?.trim() || c.email?.trim() || c.foto_url),
  );

  if (items.length === 0) return null;

  return (
    <section className="pt-4 lg:pt-8 pb-16 lg:pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 lg:mb-12">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900">{titulo}</h2>
          {subtitulo && (
            <p className="mt-2 text-sm lg:text-base text-slate-500 max-w-2xl mx-auto">
              {subtitulo}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {items.map((c) => {
            const telDigits = soloDigitos(c.telefono);
            const fuente = c.id ? `contacto_comercial_${c.id}` : 'contacto_comercial';
            return (
              <article
                key={c.id || c.nombre}
                className="relative rounded-3xl p-6 flex flex-col items-center text-center backdrop-blur-md bg-white/75 border border-white/70 shadow-lg shadow-slate-900/5"
              >
                {/* Foto circular. Si no hay foto, placeholder neutro con
                    icono para mantener el layout de la grilla. */}
                <div className="w-36 h-36 rounded-full overflow-hidden bg-slate-100 ring-4 ring-white shadow-md">
                  {c.foto_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.foto_url}
                      alt={c.nombre}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <User className="w-14 h-14" />
                    </div>
                  )}
                </div>

                {/* Nombre en pill primary (alineado al mockup Diana) */}
                <div className="-mt-4 px-5 py-2 rounded-full bg-primary text-slate-900 font-extrabold text-base shadow-sm">
                  {c.nombre}
                </div>

                {c.cargo && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {c.cargo}
                  </p>
                )}

                <div className="mt-4 space-y-1 text-sm text-slate-700">
                  {c.telefono && (
                    <a
                      href={telDigits ? `tel:+${telDigits}` : undefined}
                      className="block hover:text-primary transition-colors"
                    >
                      {c.telefono}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="block hover:text-primary transition-colors break-all"
                    >
                      {c.email}
                    </a>
                  )}
                </div>

                <div className="mt-5 w-full flex flex-col sm:flex-row gap-2 justify-center">
                  {telDigits && (
                    <LeadButton
                      fuente={fuente}
                      texto="WhatsApp"
                      variant="whatsapp"
                      mensajePrefill={c.mensaje_prefill}
                      numeroOverride={telDigits}
                      className="!px-4 !py-2 !text-sm flex-1 justify-center"
                    />
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:border-primary hover:text-primary transition-colors flex-1"
                    >
                      <Mail className="w-4 h-4" /> Email
                    </a>
                  )}
                  {!telDigits && !c.email && (
                    // Safety: si por algun motivo el comercial quedo sin
                    // canales accionables (filtro de arriba lo descarta),
                    // renderizamos un placeholder discreto.
                    <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> Sin canales configurados
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
