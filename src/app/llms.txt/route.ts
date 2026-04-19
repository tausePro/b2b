import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';
import { getSeccionesActivas, LANDING_CACHE_TAG } from '@/lib/landing/getContenido';

// Debe ser un literal numérico: Next 16 exige segment configs estáticos.
export const revalidate = 300;

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

/**
 * /llms.txt — estándar https://llmstxt.org
 *
 * Archivo Markdown curado para que LLMs descubran qué ofrece Imprima y dónde
 * encontrar información relevante. Se genera dinámicamente desde el CMS
 * (landing_contenido) para que se mantenga actualizado cuando dirección edite el sitio.
 *
 * Categorías reutiliza el cache del catálogo público (15 min) para no golpear Odoo.
 */
export async function GET() {
  const baseUrl = getSiteUrl();
  const secciones = await getSeccionesActivas();

  const seo = secciones.seo ?? null;
  const contacto = secciones.pagina_contacto ?? null;
  const faq = secciones.pagina_faq ?? null;
  const nosotros = secciones.pagina_nosotros ?? null;

  const tituloSitio = seo?.titulo?.trim() || 'Imprima — Suministros Corporativos B2B';
  const descripcion = seo?.subtitulo?.trim()
    || 'Soluciones integrales de suministros corporativos en Colombia. Papelería, aseo, cafetería y productos personalizados para empresas.';

  const contactoData = (contacto?.contenido ?? {}) as ContactoContenido;
  const faqItems = Array.isArray((faq?.contenido as { items?: FaqItem[] } | undefined)?.items)
    ? ((faq!.contenido as { items?: FaqItem[] }).items ?? [])
    : [];

  // Construcción línea por línea para control de formato.
  const lineas: string[] = [];

  // H1 + blockquote (obligatorios por el estándar).
  lineas.push('# ' + tituloSitio);
  lineas.push('');
  lineas.push('> ' + descripcion);
  lineas.push('');

  // Información general del sitio.
  if (nosotros?.subtitulo) {
    lineas.push(nosotros.subtitulo.trim());
    lineas.push('');
  }

  lineas.push(
    'Imprima es una plataforma B2B que conecta a empresas con un catálogo corporativo de suministros integrado con Odoo. Atendemos a departamentos de compras, administración y operaciones con gestión por sedes, aprobaciones y control de presupuesto.'
  );
  lineas.push('');

  // Páginas principales
  lineas.push('## Páginas principales');
  lineas.push('');
  lineas.push('- [Inicio](' + baseUrl + '/): visión general de Imprima y propuesta de valor corporativa.');
  if (nosotros) {
    lineas.push('- [Sobre nosotros](' + baseUrl + '/nosotros): historia, misión y valores de la empresa.');
  }
  lineas.push('- [Catálogo](' + baseUrl + '/catalogo): productos corporativos disponibles, filtrados por categoría.');
  if (faq) {
    lineas.push('- [Preguntas frecuentes](' + baseUrl + '/faq): respuestas sobre pedidos, envíos y operación comercial.');
  }
  if (contacto) {
    lineas.push('- [Contacto](' + baseUrl + '/contacto): formulario de contacto y canales de atención.');
  }
  lineas.push('');

  // Contacto estructurado
  const tieneContacto = Boolean(contactoData.telefono || contactoData.email || contactoData.direccion);
  if (tieneContacto) {
    lineas.push('## Contacto');
    lineas.push('');
    if (contactoData.telefono) lineas.push('- Teléfono: ' + contactoData.telefono);
    if (contactoData.email) lineas.push('- Email: ' + contactoData.email);
    if (contactoData.direccion) {
      const direccionCompleta = [contactoData.direccion, contactoData.ciudad].filter(Boolean).join(', ');
      lineas.push('- Dirección: ' + direccionCompleta);
    }
    if (contactoData.horario) lineas.push('- Horario: ' + contactoData.horario);
    lineas.push('');
  }

  // FAQ (si existe)
  const faqValidas = faqItems.filter((i): i is Required<FaqItem> =>
    typeof i.pregunta === 'string' && i.pregunta.trim().length > 0 &&
    typeof i.respuesta === 'string' && i.respuesta.trim().length > 0
  );
  if (faqValidas.length > 0) {
    lineas.push('## Preguntas frecuentes');
    lineas.push('');
    for (const item of faqValidas.slice(0, 20)) {
      lineas.push('- **' + item.pregunta.trim() + '** — ' + item.respuesta.trim());
    }
    lineas.push('');
  }

  // Referencias estructuradas (opcional, siguiendo el spec).
  lineas.push('## Optional');
  lineas.push('');
  lineas.push('- [Términos y condiciones](' + baseUrl + '/terminos)');
  lineas.push('- [Política de privacidad](' + baseUrl + '/privacidad)');
  lineas.push('- [Sitemap](' + baseUrl + '/sitemap.xml)');
  lineas.push('');

  const cuerpo = lineas.join('\n');

  return new NextResponse(cuerpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      // Tag para revalidar junto con el resto del CMS
      'X-Cache-Tag': LANDING_CACHE_TAG,
    },
  });
}
