import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';

/**
 * /.well-known/openapi.json
 *
 * API Catalog mínimo que declara los endpoints públicos que un agente puede
 * invocar sin autenticación. No expone endpoints internos ni privados.
 *
 * Spec: https://spec.openapis.org/oas/v3.1.0
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Imprima Public API',
      version: '1.0.0',
      description:
        'Endpoints públicos del sitio Imprima (imprima.com.co) accesibles por agentes IA y clientes sin autenticación. ' +
        'Las operaciones transaccionales de la plataforma B2B están fuera de este catálogo.',
      contact: {
        name: 'Imprima',
        url: baseUrl,
      },
    },
    servers: [{ url: baseUrl, description: 'Producción' }],
    paths: {
      '/api/leads': {
        post: {
          summary: 'Enviar solicitud de contacto / cotización',
          description:
            'Crea un lead en el CRM de Imprima con los datos provistos. ' +
            'El cliente recibe confirmación por email y un asesor comercial hace seguimiento.',
          operationId: 'submitLead',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LeadInput' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Lead creado correctamente',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      id: { type: 'string' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Datos inválidos' },
            '429': { description: 'Rate limit excedido' },
          },
        },
      },
      '/llms.txt': {
        get: {
          summary: 'llms.txt (contenido curado para LLMs)',
          description: 'Markdown con información estructurada del sitio siguiendo https://llmstxt.org',
          operationId: 'getLlmsTxt',
          responses: {
            '200': {
              description: 'Documento Markdown',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
          },
        },
      },
      '/sitemap.xml': {
        get: {
          summary: 'Sitemap XML del sitio',
          operationId: 'getSitemap',
          responses: {
            '200': {
              description: 'XML sitemap',
              content: { 'application/xml': { schema: { type: 'string' } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        LeadInput: {
          type: 'object',
          required: ['nombre', 'email', 'mensaje'],
          properties: {
            nombre: { type: 'string', description: 'Nombre completo del contacto', minLength: 2, maxLength: 120 },
            email: { type: 'string', format: 'email', description: 'Email corporativo preferiblemente' },
            telefono: { type: 'string', description: 'Teléfono de contacto (opcional)' },
            empresa: { type: 'string', description: 'Nombre de la empresa' },
            mensaje: { type: 'string', description: 'Descripción de la necesidad o cotización', minLength: 5, maxLength: 2000 },
            origen: { type: 'string', description: 'Página o campaña de origen (opcional)' },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
