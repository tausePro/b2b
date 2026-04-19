import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';

export const revalidate = 3600;

/**
 * /.well-known/api-catalog
 *
 * API Catalog estándar según RFC 9727 (https://www.rfc-editor.org/rfc/rfc9727).
 * Usa el formato `application/linkset+json` de RFC 9264 para listar las APIs
 * que el sitio expone, con sus respectivos descriptores (OpenAPI), docs y
 * health endpoint.
 *
 * Estructura:
 *   {
 *     "linkset": [
 *       {
 *         "anchor": "<URL del recurso API>",
 *         "service-desc": [{ "href": "...", "type": "application/openapi+json" }],
 *         "service-doc":  [{ "href": "...", "type": "text/html" }],
 *         "status":       [{ "href": "...", "type": "application/json" }]
 *       }
 *     ]
 *   }
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  const catalog = {
    linkset: [
      {
        // Ancla: URL raíz de la API pública de Imprima.
        anchor: baseUrl + '/api',
        'service-desc': [
          {
            href: baseUrl + '/.well-known/openapi.json',
            type: 'application/openapi+json',
            title: 'Especificación OpenAPI 3.1 de la API pública',
          },
        ],
        'service-doc': [
          {
            href: baseUrl + '/llms.txt',
            type: 'text/plain',
            title: 'Documentación curada para LLMs',
          },
          {
            href: baseUrl + '/.well-known/agent-manifest.json',
            type: 'application/json',
            title: 'Manifest de capacidades para agentes IA',
          },
        ],
        status: [
          {
            href: baseUrl + '/api/health',
            type: 'application/json',
            title: 'Health check endpoint',
          },
        ],
      },
    ],
  };

  return new NextResponse(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      // MIME type registrado en RFC 9264 para linksets.
      'Content-Type': 'application/linkset+json',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
