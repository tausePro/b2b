import 'server-only';
import { getSeccionesActivas, type LandingSeccion } from '@/lib/landing/getContenido';
import { getSiteUrl } from '@/lib/siteUrl';
import {
  getPublicCatalogPageData,
  getPublicCatalogRootCategories,
} from '@/lib/catalogoPublico';
import type { PublicCatalogCategoryNode } from '@/types/publicCatalog';
import { getEmpaquesLandingConfig } from '@/lib/empaques/landing-config';
import { DEFAULT_LANDING_CONFIG } from '@/lib/empaques/landing-config-shared';
import {
  EMPAQUES_CANONICAL_ORIGIN,
  buildEmpaquesHomeCanonical,
  buildEmpaquesPersonalizadosCanonical,
  buildEmpaquesProductCanonical,
} from '@/lib/empaques/seo';
import { loadEmpaquesSiteIndex } from '@/lib/empaques/site-index';

interface ContactoContenido {
  telefono?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
  horario?: string;
}

interface FaqItem {
  pregunta?: string;
  respuesta?: string;
}

interface CategoriaItem {
  categoria_id?: number;
  titulo?: string;
  descripcion?: string;
}

interface EficienciaItem {
  titulo?: string;
  descripcion?: string;
}

interface TestimonioItem {
  nombre?: string;
  cargo?: string;
  empresa?: string;
  texto?: string;
}

interface PaginaNosotrosContenido {
  cuerpo?: string;
  mision?: string;
  vision?: string;
  valores?: string[];
}

interface PaginaCuerpoContenido {
  cuerpo?: string;
}

export interface MarkdownResult {
  title: string;
  body: string;
  /** Markdown completo con frontmatter YAML */
  full: string;
}

/** Rutas públicas soportadas por el conversor a Markdown. */
export const RUTAS_MARKDOWN: ReadonlySet<string> = new Set([
  '/',
  '/nosotros',
  '/contacto',
  '/faq',
  '/terminos',
  '/privacidad',
  '/catalogo',
  '/empaques',
  '/empaques/personalizados',
]);

function normalizarPath(path: string): string {
  const sinQuery = path.split('?')[0];
  if (!sinQuery) return '/';
  // Elimina trailing slash excepto la raíz
  if (sinQuery.length > 1 && sinQuery.endsWith('/')) {
    return sinQuery.slice(0, -1);
  }
  return sinQuery;
}

function construirFrontmatter(title: string, canonical: string, descripcion?: string | null): string {
  const lineas = ['---', 'title: ' + JSON.stringify(title), 'canonical: ' + JSON.stringify(canonical)];
  if (descripcion) lineas.push('description: ' + JSON.stringify(descripcion));
  lineas.push('---', '');
  return lineas.join('\n');
}

// ────────────────── Renderers por ruta ──────────────────

async function renderHome(
  secciones: Record<string, LandingSeccion>,
  baseUrl: string,
): Promise<MarkdownResult> {
  const hero = secciones.hero ?? null;
  const categorias = secciones.categorias ?? null;
  const eficiencia = secciones.eficiencia ?? null;
  const testimonios = secciones.testimonios ?? null;

  // Mapa de categorías reales (Odoo) para resolver nombre cuando el admin
  // vinculó el item por categoria_id en vez de escribirlo a mano. Si Odoo
  // falla, el map queda vacío y caemos en los campos legacy.
  let categoriasMap = new Map<number, { id: number; name: string }>();
  try {
    const roots = await getPublicCatalogRootCategories();
    categoriasMap = new Map(roots.map((c) => [c.id, { id: c.id, name: c.name }]));
  } catch {
    // silencioso: markdown sigue funcionando con títulos legacy
  }

  const title = hero?.titulo?.trim() || 'Imprima — Suministros Corporativos B2B';
  const descripcion = hero?.subtitulo?.trim() || null;

  const lineas: string[] = [];
  lineas.push('# ' + title);
  lineas.push('');
  if (descripcion) {
    lineas.push(descripcion);
    lineas.push('');
  }

  if (categorias) {
    lineas.push('## ' + (categorias.titulo?.trim() || 'Categorías'));
    if (categorias.subtitulo) {
      lineas.push('');
      lineas.push(categorias.subtitulo.trim());
    }
    const items = (categorias.contenido as { items?: CategoriaItem[] }).items;
    if (Array.isArray(items) && items.length > 0) {
      lineas.push('');
      for (const item of items) {
        // Título: real desde Odoo (si hay categoria_id) o legacy, en ese orden.
        const tituloResuelto =
          (typeof item.categoria_id === 'number'
            ? categoriasMap.get(item.categoria_id)?.name
            : undefined) ?? item.titulo?.trim();
        if (!tituloResuelto) continue;
        const desc = item.descripcion ? ' — ' + item.descripcion.trim() : '';
        lineas.push('- **' + tituloResuelto + '**' + desc);
      }
    }
    lineas.push('');
  }

  if (eficiencia) {
    lineas.push('## ' + (eficiencia.titulo?.trim() || 'Eficiencia operativa'));
    if (eficiencia.subtitulo) {
      lineas.push('');
      lineas.push(eficiencia.subtitulo.trim());
    }
    const items = (eficiencia.contenido as { items?: EficienciaItem[] }).items;
    if (Array.isArray(items) && items.length > 0) {
      lineas.push('');
      for (const item of items) {
        if (item.titulo) {
          const desc = item.descripcion ? ' — ' + item.descripcion.trim() : '';
          lineas.push('- **' + item.titulo.trim() + '**' + desc);
        }
      }
    }
    lineas.push('');
  }

  if (testimonios) {
    lineas.push('## ' + (testimonios.titulo?.trim() || 'Testimonios'));
    const items = (testimonios.contenido as { items?: TestimonioItem[] }).items;
    if (Array.isArray(items) && items.length > 0) {
      lineas.push('');
      for (const item of items) {
        if (item.texto) {
          const autor = [item.nombre, item.cargo, item.empresa].filter(Boolean).join(' · ');
          lineas.push('> ' + item.texto.trim() + (autor ? ' — _' + autor + '_' : ''));
          lineas.push('');
        }
      }
    }
    lineas.push('');
  }

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, baseUrl + '/', descripcion) + body };
}

function renderNosotros(secciones: Record<string, LandingSeccion>, baseUrl: string): MarkdownResult {
  const s = secciones.pagina_nosotros ?? null;
  const title = s?.titulo?.trim() || 'Sobre Nosotros';
  const descripcion = s?.subtitulo?.trim() || null;
  const contenido = (s?.contenido ?? {}) as PaginaNosotrosContenido;

  const lineas: string[] = ['# ' + title, ''];
  if (descripcion) {
    lineas.push(descripcion);
    lineas.push('');
  }
  if (contenido.cuerpo) {
    lineas.push(contenido.cuerpo.trim());
    lineas.push('');
  }
  if (contenido.mision) {
    lineas.push('## Misión');
    lineas.push('');
    lineas.push(contenido.mision.trim());
    lineas.push('');
  }
  if (contenido.vision) {
    lineas.push('## Visión');
    lineas.push('');
    lineas.push(contenido.vision.trim());
    lineas.push('');
  }
  if (Array.isArray(contenido.valores) && contenido.valores.length > 0) {
    lineas.push('## Valores');
    lineas.push('');
    for (const valor of contenido.valores) {
      if (typeof valor === 'string' && valor.trim()) {
        lineas.push('- ' + valor.trim());
      }
    }
    lineas.push('');
  }

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, baseUrl + '/nosotros', descripcion) + body };
}

function renderContacto(secciones: Record<string, LandingSeccion>, baseUrl: string): MarkdownResult {
  const s = secciones.pagina_contacto ?? null;
  const title = s?.titulo?.trim() || 'Contacto';
  const descripcion = s?.subtitulo?.trim() || null;
  const c = (s?.contenido ?? {}) as ContactoContenido;

  const lineas: string[] = ['# ' + title, ''];
  if (descripcion) {
    lineas.push(descripcion);
    lineas.push('');
  }
  if (c.telefono) lineas.push('- **Teléfono:** ' + c.telefono);
  if (c.email) lineas.push('- **Email:** ' + c.email);
  if (c.direccion) {
    const completa = [c.direccion.replace(/\s+/g, ' ').trim(), c.ciudad?.trim()].filter(Boolean).join(', ');
    lineas.push('- **Dirección:** ' + completa);
  }
  if (c.horario) lineas.push('- **Horario:** ' + c.horario);

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, baseUrl + '/contacto', descripcion) + body };
}

function renderFaq(secciones: Record<string, LandingSeccion>, baseUrl: string): MarkdownResult {
  const s = secciones.pagina_faq ?? null;
  const title = s?.titulo?.trim() || 'Preguntas Frecuentes';
  const descripcion = s?.subtitulo?.trim() || null;
  const items = ((s?.contenido ?? {}) as { items?: FaqItem[] }).items ?? [];

  const lineas: string[] = ['# ' + title, ''];
  if (descripcion) {
    lineas.push(descripcion);
    lineas.push('');
  }
  for (const item of items) {
    if (item.pregunta && item.respuesta) {
      lineas.push('## ' + item.pregunta.trim());
      lineas.push('');
      lineas.push(item.respuesta.trim());
      lineas.push('');
    }
  }

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, baseUrl + '/faq', descripcion) + body };
}

function renderPaginaCuerpo(
  secciones: Record<string, LandingSeccion>,
  baseUrl: string,
  seccionId: 'pagina_terminos' | 'pagina_privacidad',
  path: '/terminos' | '/privacidad'
): MarkdownResult {
  const s = secciones[seccionId] ?? null;
  const title = s?.titulo?.trim()
    || (seccionId === 'pagina_terminos' ? 'Términos y Condiciones' : 'Política de Privacidad');
  const descripcion = s?.subtitulo?.trim() || null;
  const cuerpo = ((s?.contenido ?? {}) as PaginaCuerpoContenido).cuerpo?.trim() || '';

  const lineas: string[] = ['# ' + title, ''];
  if (descripcion) {
    lineas.push(descripcion);
    lineas.push('');
  }
  if (cuerpo) {
    lineas.push(cuerpo);
    lineas.push('');
  }

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, baseUrl + path, descripcion) + body };
}

function aplanarCategorias(nodos: PublicCatalogCategoryNode[]): PublicCatalogCategoryNode[] {
  const r: PublicCatalogCategoryNode[] = [];
  const visit = (xs: PublicCatalogCategoryNode[]) => {
    for (const x of xs) {
      r.push(x);
      if (x.children?.length) visit(x.children);
    }
  };
  visit(nodos);
  return r;
}

async function renderCatalogo(baseUrl: string): Promise<MarkdownResult> {
  const title = 'Catálogo Imprima';
  const descripcion = 'Catálogo corporativo de suministros B2B: papelería, aseo, cafetería, tecnología y más.';

  const lineas: string[] = ['# ' + title, '', descripcion, ''];

  try {
    const { categories } = await getPublicCatalogPageData();
    if (Array.isArray(categories) && categories.length > 0) {
      lineas.push('## Categorías disponibles');
      lineas.push('');
      const todas = aplanarCategorias(categories);
      for (const cat of todas) {
        const url = baseUrl + '/catalogo?categoria=' + encodeURIComponent(String(cat.id));
        const indent = '  '.repeat(Math.max(0, cat.level));
        lineas.push(indent + '- [' + cat.name + '](' + url + ')');
      }
      lineas.push('');
    }
  } catch {
    // Silencioso; devolvemos solo la cabecera si el catálogo falla.
  }

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, baseUrl + '/catalogo', descripcion) + body };
}

async function renderEmpaques(): Promise<MarkdownResult> {
  const landing = await getEmpaquesLandingConfig().catch(() => DEFAULT_LANDING_CONFIG);
  const title = 'Empaques Imprima';
  const descripcion = landing.hero.subtitulo?.trim()
    || 'Soluciones de empaque para empresas en Colombia: bolsas kraft, empaques reciclables y personalización CMYK.';

  const lineas: string[] = ['# ' + title, '', descripcion, ''];
  lineas.push('Precios publicados antes de IVA. Las solicitudes se atienden con asesoría comercial de Imprima S.A.S.');
  lineas.push('');
  lineas.push(`- [Empaques personalizados](${buildEmpaquesPersonalizadosCanonical()}): impresión CMYK sobre bolsas kraft, una o dos caras.`);
  lineas.push('- [Contacto](https://imprima.com.co/contacto)');
  lineas.push('');

  try {
    const index = await loadEmpaquesSiteIndex();
    if (index.categories.length > 0) {
      lineas.push('## Categorías');
      lineas.push('');
      for (const category of index.categories) {
        lineas.push(`${'  '.repeat(Math.max(0, category.level))}- [${category.name}](${buildEmpaquesHomeCanonical(category.id)})`);
      }
      lineas.push('');
    }
    if (index.products.length > 0) {
      lineas.push(`## Productos publicados (${index.totalProducts})`);
      lineas.push('');
      for (const product of index.products) {
        const reference = typeof product.default_code === 'string' && product.default_code ? ` — ref. ${product.default_code}` : '';
        lineas.push(`- [${product.name}](${buildEmpaquesProductCanonical(product.id)})${reference}`);
      }
      if (index.truncated) lineas.push(`- Catálogo completo: ${EMPAQUES_CANONICAL_ORIGIN}/sitemap.xml`);
      lineas.push('');
    }
  } catch {
    lineas.push('El listado de productos no está disponible temporalmente; consulta el catálogo en línea.');
    lineas.push('');
  }

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, EMPAQUES_CANONICAL_ORIGIN + '/', descripcion) + body };
}

async function renderEmpaquesPersonalizados(): Promise<MarkdownResult> {
  const landing = await getEmpaquesLandingConfig().catch(() => DEFAULT_LANDING_CONFIG);
  const config = landing.personalizados;
  const title = config.titulo?.trim() || 'Empaques Personalizados';
  const descripcion = config.subtitulo?.trim() || 'Impresión CMYK sobre referencias de bolsas kraft.';

  const lineas: string[] = ['# ' + title, '', descripcion, ''];
  lineas.push('Cómo funciona: elige una bolsa kraft disponible, selecciona producción o muestra y una o dos caras, y sube un archivo TIFF por cada cara impresa. El arte se ajusta al área imprimible sin recortes ni estiramientos.');
  lineas.push('');
  lineas.push('El envío del formulario no genera un precio automático: el equipo revisa la viabilidad técnica y prepara la propuesta comercial.');
  lineas.push('');

  const referencias = config.referencias.filter((referencia) => referencia.activo);
  if (referencias.length > 0) {
    lineas.push('## Referencias disponibles');
    lineas.push('');
    for (const referencia of referencias) {
      lineas.push(`- **${referencia.nombre}** (ref. ${referencia.sku}) — área imprimible ${referencia.alto_cm} × ${referencia.ancho_cm} cm (alto × ancho). El área corresponde a impresión, no a las medidas de la bolsa.`);
    }
    lineas.push('');
  }

  lineas.push('## Requisitos del arte');
  lineas.push('');
  lineas.push('- Formato TIFF, uno por cara impresa (frente o frente y reverso).');
  lineas.push('- Resolución mínima 150 ppp efectivos al tamaño colocado; recomendada 300 ppp.');
  lineas.push('- Tamaño máximo 100 MiB por archivo. Los archivos y sus vistas previas son privados.');
  lineas.push('');
  lineas.push(`[Configurar un empaque](${buildEmpaquesPersonalizadosCanonical()})`);
  lineas.push('');

  const body = lineas.join('\n').trim() + '\n';
  return { title, body, full: construirFrontmatter(title, buildEmpaquesPersonalizadosCanonical(), descripcion) + body };
}

// ────────────────── API pública ──────────────────

/**
 * Devuelve la versión Markdown de una ruta pública del sitio.
 * Devuelve null si la ruta no está soportada.
 */
export async function getMarkdownForPath(path: string): Promise<MarkdownResult | null> {
  const normalizado = normalizarPath(path);
  if (!RUTAS_MARKDOWN.has(normalizado)) return null;

  // Las vistas de Empaques no dependen del CMS corporativo.
  if (normalizado === '/empaques') return await renderEmpaques();
  if (normalizado === '/empaques/personalizados') return await renderEmpaquesPersonalizados();

  const baseUrl = getSiteUrl();
  const secciones = await getSeccionesActivas();

  switch (normalizado) {
    case '/':            return await renderHome(secciones, baseUrl);
    case '/nosotros':    return renderNosotros(secciones, baseUrl);
    case '/contacto':    return renderContacto(secciones, baseUrl);
    case '/faq':         return renderFaq(secciones, baseUrl);
    case '/terminos':    return renderPaginaCuerpo(secciones, baseUrl, 'pagina_terminos', '/terminos');
    case '/privacidad':  return renderPaginaCuerpo(secciones, baseUrl, 'pagina_privacidad', '/privacidad');
    case '/catalogo':    return await renderCatalogo(baseUrl);
    default:             return null;
  }
}

/**
 * Conteo aproximado de tokens siguiendo la heurística ~4 chars por token que
 * usan la mayoría de tokenizers OpenAI/Anthropic. Es una aproximación
 * suficiente para el header x-markdown-tokens.
 */
export function estimateMarkdownTokens(markdown: string): number {
  return Math.max(1, Math.ceil(markdown.length / 4));
}
