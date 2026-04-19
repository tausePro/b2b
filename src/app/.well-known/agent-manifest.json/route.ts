import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';
import { getSeccionesActivas } from '@/lib/landing/getContenido';

// Literal numérico requerido por Next 16 segment configs.
export const revalidate = 300;

interface ContactoContenido {
  telefono?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
}

/**
 * /.well-known/agent-manifest.json
 *
 * Descriptor del sitio para agentes IA. Expone:
 *  - Identidad del sitio (nombre, descripción, contacto, logo).
 *  - URLs de recursos agent-friendly (llms.txt, sitemap, robots).
 *  - Capacidades y endpoints públicos relevantes.
 *  - Política de uso por agentes (content-signal).
 *
 * Este manifest no está cubierto por un estándar único aún, pero su shape
 * está inspirada en la convención emergente de /.well-known/ai-plugin.json
 * (OpenAI) más extensiones de discoverability de llmstxt.org y Cloudflare.
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  let telefono: string | undefined;
  let email: string | undefined;
  let direccion: string | undefined;
  let ciudad: string | undefined;
  try {
    const secciones = await getSeccionesActivas();
    const contacto = (secciones.pagina_contacto?.contenido ?? {}) as ContactoContenido;
    telefono = contacto.telefono;
    email = contacto.email;
    direccion = contacto.direccion?.replace(/\s+/g, ' ').trim();
    ciudad = contacto.ciudad?.trim();
  } catch {
    // Silencioso; servimos manifest sin contacto si el CMS falla.
  }

  const manifest = {
    schema_version: 'v1',
    name_for_human: 'Imprima',
    name_for_model: 'imprima_b2b',
    description_for_human: 'Suministros corporativos B2B en Colombia: papelería, aseo, cafetería, tecnología y productos personalizados para empresas.',
    description_for_model:
      'Imprima es una plataforma B2B colombiana de suministros corporativos integrada con Odoo. ' +
      'Un agente puede: consultar el catálogo público por categoría, obtener información de contacto, ' +
      'conocer la propuesta de valor y enviar un lead (solicitud de contacto/cotización) desde el formulario público. ' +
      'Las operaciones transaccionales (pedidos, facturas) requieren autenticación empresarial y no están expuestas a agentes no autorizados.',
    contact: {
      ...(email ? { email } : {}),
      ...(telefono ? { phone: telefono } : {}),
      ...(direccion ? { address: [direccion, ciudad].filter(Boolean).join(', ') } : {}),
      country: 'CO',
    },
    urls: {
      home: baseUrl + '/',
      about: baseUrl + '/nosotros',
      catalog: baseUrl + '/catalogo',
      contact: baseUrl + '/contacto',
      faq: baseUrl + '/faq',
      terms: baseUrl + '/terminos',
      privacy: baseUrl + '/privacidad',
    },
    agent_resources: {
      llms_txt: baseUrl + '/llms.txt',
      sitemap: baseUrl + '/sitemap.xml',
      robots: baseUrl + '/robots.txt',
      api_catalog: baseUrl + '/.well-known/api-catalog',
      openapi: baseUrl + '/.well-known/openapi.json',
      agent_skills_index: baseUrl + '/.well-known/agent-skills/index.json',
      mcp_server_card: baseUrl + '/.well-known/mcp/server-card.json',
      mcp_endpoint: baseUrl + '/api/mcp',
      oauth_protected_resource: baseUrl + '/.well-known/oauth-protected-resource',
      oauth_discovery: baseUrl + '/.well-known/openid-configuration',
      health: baseUrl + '/api/health',
      markdown_content_negotiation: {
        description: 'Las rutas públicas responden en Markdown cuando el request incluye `Accept: text/markdown`.',
        supported_paths: ['/', '/nosotros', '/contacto', '/faq', '/terminos', '/privacidad', '/catalogo'],
      },
      webmcp: {
        description: 'Las páginas públicas registran tools en navigator.modelContext al cargar: submit_lead, browse_catalog, get_contact_info.',
        tools: ['submit_lead', 'browse_catalog', 'get_contact_info'],
      },
    },
    capabilities: [
      {
        name: 'browse_public_content',
        description: 'Leer páginas informativas (home, nosotros, faq, contacto, términos, privacidad).',
      },
      {
        name: 'browse_catalog',
        description: 'Explorar categorías y productos del catálogo corporativo vía /catalogo y /catalogo/[id].',
      },
      {
        name: 'submit_lead',
        description: 'Enviar una solicitud de contacto/cotización mediante POST a /api/leads con nombre, email, empresa y mensaje.',
        endpoint: baseUrl + '/api/leads',
        method: 'POST',
      },
    ],
    content_signal: {
      'ai-train': 'yes',
      search: 'yes',
      'ai-input': 'yes',
    },
    legal: {
      terms_of_service: baseUrl + '/terminos',
      privacy_policy: baseUrl + '/privacidad',
    },
  };

  return NextResponse.json(manifest, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
