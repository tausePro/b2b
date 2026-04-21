import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import LeadButton from '@/components/public/LeadButton';
import type { LandingSeccion } from '@/lib/landing/getContenido';
import type { HeroDynamicStats } from '@/lib/home/getHeroDynamicStats';

// Hero del home rediseñado (Opcion 1: "half-bleed asimetrico con glass").
//
// Layout:
//   - Columna izquierda (40-45%): texto + CTAs + chips de valor.
//   - Columna derecha: imagen grande que sangra hasta el borde de la
//     pantalla. Encima, una tarjeta glass flotante con dato destacado.
//   - Debajo del hero (dentro del mismo bloque): fila de stats editables.
//
// Todo el contenido se alimenta del CMS (seccion 'hero' de landing_contenido)
// con los siguientes campos en `contenido`:
//
//   badge                   : chip superior en el eyebrow.
//   cta_primario            : texto CTA solido.
//   cta_primario_url        : destino del CTA solido.
//   cta_secundario          : texto del LeadButton outline.
//   glass_card_titulo       : titulo grande de la tarjeta glass.
//   glass_card_subtitulo    : linea secundaria de la tarjeta glass.
//   stats_items[]           : barra inferior. Cada item { label, valor, suffix?, dinamico? }
//                             donde `dinamico` puede ser 'productos_total' o
//                             'categorias_total' para que reemplacemos el
//                             valor manual por el conteo real de Odoo.
//   chips_items[]           : chips de propuesta de valor junto a los CTAs.
//                             Cada item { texto, icono? }.
//
// En mobile el layout colapsa a stack vertical: texto arriba, imagen debajo,
// glass card dentro de la imagen sigue funcionando, stats bar en grilla
// 2x2.

interface Props {
  hero: LandingSeccion | undefined;
  dynamicStats: HeroDynamicStats;
}

interface StatItem {
  label: string;
  valor: string;
  suffix?: string;
  dinamico?: string;
}

interface ChipItem {
  texto: string;
  icono?: string;
}

// Resuelve el valor final de un stat: si tiene `dinamico` y viene del
// backend, formatea el numero con separador de miles; si no, usa el
// valor manual tal cual. Siempre devuelve string listo para render.
function resolveStatValue(item: StatItem, dynamic: HeroDynamicStats): string {
  const key = item.dinamico?.trim();
  if (key === 'productos_total' && typeof dynamic.productos_total === 'number') {
    return formatInt(dynamic.productos_total);
  }
  if (key === 'categorias_total' && typeof dynamic.categorias_total === 'number') {
    return formatInt(dynamic.categorias_total);
  }
  return item.valor || '';
}

function formatInt(n: number): string {
  return n.toLocaleString('es-CO');
}

export default function HeroHome({ hero, dynamicStats }: Props) {
  const c = (hero?.contenido || {}) as Record<string, unknown>;

  const titulo = hero?.titulo || 'Simplificamos las compras de tu empresa';
  const subtitulo =
    hero?.subtitulo ||
    'Soluciones integrales de suministros para su compañía con tecnología de vanguardia.';
  const badge = typeof c.badge === 'string' ? c.badge : '';
  const ctaPrimarioTexto = (c.cta_primario as string) || 'Ver Catálogo de Productos';
  const ctaPrimarioUrl = (c.cta_primario_url as string) || '/catalogo';
  const ctaSecundarioTexto = (c.cta_secundario as string) || 'Hablar con un Asesor';
  const glassTitulo = (c.glass_card_titulo as string) || '';
  const glassSubtitulo = (c.glass_card_subtitulo as string) || '';
  const statsItems = (c.stats_items as StatItem[] | undefined) || [];
  const chipsItems = (c.chips_items as ChipItem[] | undefined) || [];

  return (
    <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24">
      {/* Manchas de color de fondo para dar profundidad al glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-primary/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-60 -left-40 w-[420px] h-[420px] rounded-full bg-emerald-200/30 blur-[120px]"
      />

      <div className="relative grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Columna de texto: respeta max-width y margenes del resto de secciones */}
        <div className="lg:col-span-5 lg:col-start-1 px-4 sm:px-6 lg:pl-8 lg:pr-0 max-w-xl lg:ml-auto">
          {badge && (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              {badge}
            </span>
          )}

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight mb-5">
            {titulo}
          </h1>

          <p className="text-base sm:text-lg text-slate-600 mb-8 leading-relaxed">
            {subtitulo}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={ctaPrimarioUrl}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-slate-900 px-7 py-3.5 rounded-xl font-bold text-base transition-all shadow-lg shadow-primary/20 text-center"
            >
              {ctaPrimarioTexto}
            </Link>
            <LeadButton
              fuente="landing_hero"
              texto={ctaSecundarioTexto}
              variant="outline"
              className="!px-7 !py-3.5 !text-base"
            />
          </div>

          {chipsItems.length > 0 && (
            <ul className="mt-7 flex flex-wrap gap-2">
              {chipsItems.map((chip, i) => (
                <li
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 backdrop-blur-md bg-white/70 border border-slate-200/70 shadow-sm"
                >
                  <span aria-hidden className="text-primary">✓</span>
                  {chip.texto}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Columna de imagen: sangra hasta el borde derecho de la viewport.
            Logramos el "bleed" dejando que el bloque viva fuera del max-w-7xl
            del contenedor padre y absolut-izando la tarjeta glass encima. */}
        <div className="lg:col-span-7 relative">
          <div className="relative lg:ml-0 lg:mr-[calc((100vw-min(100vw,80rem))/-2)]">
            {hero?.imagen_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={hero.imagen_url}
                alt={titulo}
                className="w-full h-[380px] sm:h-[480px] lg:h-[560px] object-cover rounded-l-3xl lg:rounded-l-[2.5rem] shadow-2xl"
                loading="eager"
                decoding="async"
              />
            ) : (
              // Fallback cuando el admin aun no ha subido imagen: degradado
              // decorativo que preserva el layout sin dejar un hueco.
              <div className="w-full h-[380px] sm:h-[480px] lg:h-[560px] rounded-l-3xl lg:rounded-l-[2.5rem] bg-gradient-to-br from-primary/30 via-primary/10 to-emerald-200/30 flex items-center justify-center shadow-2xl">
                <Sparkles className="w-20 h-20 text-primary/40" />
              </div>
            )}

            {/* Tarjeta glass flotante: dato destacado o testimonio corto.
                Solo la renderizamos si el admin la configuro, para no
                ensuciar la imagen con contenido vacio. */}
            {glassTitulo && (
              <div className="hidden sm:block absolute left-4 bottom-4 sm:left-6 sm:bottom-6 lg:-left-10 lg:bottom-10 max-w-xs">
                <div className="backdrop-blur-xl bg-white/75 border border-white/60 shadow-xl shadow-slate-900/10 rounded-2xl px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 rounded-xl bg-primary/15 p-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-extrabold leading-tight text-slate-900">
                        {glassTitulo}
                      </p>
                      {glassSubtitulo && (
                        <p className="text-xs text-slate-600 mt-0.5">{glassSubtitulo}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar: barra de indicadores alineados con el contenedor principal */}
      {statsItems.length > 0 && (
        <div className="relative mt-12 lg:mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {statsItems.map((item, i) => {
                const valor = resolveStatValue(item, dynamicStats);
                return (
                  <li
                    key={i}
                    className="backdrop-blur-md bg-white/60 border border-white/60 rounded-2xl px-4 py-4 shadow-sm"
                  >
                    <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none">
                      {valor}
                      {item.suffix && (
                        <span className="text-primary ml-0.5">{item.suffix}</span>
                      )}
                    </p>
                    <p className="mt-1.5 text-xs sm:text-sm text-slate-500 font-medium">
                      {item.label}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
