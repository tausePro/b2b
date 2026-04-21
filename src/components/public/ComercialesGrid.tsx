import { Mail, MessageCircle, Phone, User } from 'lucide-react';
import LeadButton from '@/components/public/LeadButton';

// Grilla de tarjetas del equipo comercial para /contacto. Cada tarjeta
// muestra foto + nombre + cargo + telefono + email, con botones
// accionables:
//   - WhatsApp: abre el LeadModal con mensaje prefill y redirige al
//     numero de ESA comercial (via numeroOverride), registrando el lead
//     con fuente='contacto_comercial_<id>' para trazabilidad por persona.
//   - Email: mailto directo.
//
// Diseño visual (v1.24.1):
//   Tarjeta glass con un halo decorativo primary detras de la foto y
//   el nombre en tipografia grande DEBAJO de la foto (no como pill
//   superpuesto, para evitar que choque con uniformes que traen el
//   nombre bordado). Tipografia con mayor jerarquia: nombre prominente,
//   cargo en eyebrow uppercase, contactos con icono + hover primary,
//   y botones CTA full-width con separacion clara.

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

        {/* Layout adaptativo: si hay 1 tarjeta se centra con max-w estrecho,
            si hay 2 se muestran en columnas equilibradas, 3+ entran en grid.
            Esto evita la sensacion de "tarjeta solitaria" cuando el equipo
            apenas tiene una asesora configurada. */}
        <div
          className={
            items.length === 1
              ? 'max-w-sm mx-auto'
              : items.length === 2
                ? 'grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8'
          }
        >
          {items.map((c) => {
            const telDigits = soloDigitos(c.telefono);
            const fuente = c.id ? `contacto_comercial_${c.id}` : 'contacto_comercial';
            return (
              <article
                key={c.id || c.nombre}
                className="group relative rounded-3xl pt-10 pb-7 px-6 flex flex-col items-center text-center backdrop-blur-md bg-white/80 border border-white/70 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 transition-all"
              >
                {/* Halo decorativo primary detras de la foto. No es
                    interactivo (pointer-events-none) y usa blur para un
                    acento suave que refuerza el brand sin competir con
                    la foto. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-primary/25 blur-2xl opacity-70 group-hover:opacity-90 transition-opacity"
                />

                {/* Foto circular. Si no hay foto, placeholder neutro con
                    icono para mantener el layout de la grilla. */}
                <div className="relative w-36 h-36 rounded-full overflow-hidden bg-slate-100 ring-4 ring-white shadow-md">
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

                {/* Nombre debajo de la foto (sin pill superpuesto). El
                    acento primary se logra con un subrayado sutil, en
                    vez de un badge encima de la imagen. */}
                <h3 className="relative mt-5 text-xl font-extrabold text-slate-900 leading-tight">
                  {c.nombre}
                </h3>
                <span
                  aria-hidden
                  className="relative mt-1.5 block h-1 w-10 rounded-full bg-primary"
                />

                {c.cargo && (
                  <p className="relative mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {c.cargo}
                  </p>
                )}

                <div className="relative mt-5 w-full space-y-2 text-sm text-slate-600">
                  {c.telefono && (
                    <a
                      href={telDigits ? `tel:+${telDigits}` : undefined}
                      className="flex items-center justify-center gap-2 hover:text-primary transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.telefono}</span>
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center justify-center gap-2 hover:text-primary transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="break-all">{c.email}</span>
                    </a>
                  )}
                </div>

                <div className="relative mt-6 w-full flex flex-col sm:flex-row gap-2">
                  {telDigits && (
                    <LeadButton
                      fuente={fuente}
                      texto="WhatsApp"
                      variant="whatsapp"
                      mensajePrefill={c.mensaje_prefill}
                      numeroOverride={telDigits}
                      className="!px-4 !py-2.5 !text-sm flex-1 justify-center"
                    />
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:border-primary hover:text-primary transition-colors flex-1"
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
