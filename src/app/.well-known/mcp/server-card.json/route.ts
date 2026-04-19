import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';
import { MCP_CAPABILITIES, MCP_SERVER_INFO, MCP_TOOLS } from '@/lib/mcp/tools';

export const revalidate = 3600;

/**
 * /.well-known/mcp/server-card.json
 *
 * MCP Server Card según SEP-1649
 * (https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127).
 *
 * Documento de descubrimiento que anuncia la existencia del servidor MCP
 * de Imprima, sus datos identificatorios, transporte HTTP Streamable, y las
 * capabilities/tools expuestas.
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  const card = {
    $schema:
      'https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/server-card.schema.json',
    version: '0.1.0',
    serverInfo: {
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      title: MCP_SERVER_INFO.title,
      vendor: MCP_SERVER_INFO.vendor,
      protocolVersion: MCP_SERVER_INFO.protocolVersion,
      description:
        'MCP server público de Imprima. Permite a agentes IA enviar leads de cotización, explorar el catálogo corporativo y obtener información de contacto oficial.',
      homepage: baseUrl,
      documentation: baseUrl + '/llms.txt',
    },
    transport: {
      type: 'http',
      subtype: 'streamable',
      endpoint: baseUrl + '/api/mcp',
      authentication: {
        required: false,
        schemes: [],
        note: 'Las herramientas públicas no requieren autenticación. Endpoints B2B protegidos usan OAuth 2.0 vía Supabase (ver /.well-known/oauth-protected-resource).',
      },
    },
    capabilities: MCP_CAPABILITIES,
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    resources: [],
    prompts: [],
    contact: {
      url: baseUrl + '/contacto',
      docs: baseUrl + '/.well-known/agent-manifest.json',
    },
  };

  return NextResponse.json(card, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
