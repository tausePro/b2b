import 'server-only';

/**
 * Definición de las tools MCP que expone Imprima por /api/mcp.
 *
 * Reusa la misma lista conceptual que WebMCP (submit_lead, browse_catalog,
 * get_contact_info) pero en el formato JSON-RPC de Model Context Protocol.
 *
 * Spec de referencia:
 *   - https://modelcontextprotocol.io/specification
 *   - https://spec.modelcontextprotocol.io/specification/server/tools/
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_SERVER_INFO = {
  name: 'imprima-mcp',
  version: '1.0.0',
  title: 'Imprima B2B MCP Server',
  vendor: 'Imprima S.A.S.',
  protocolVersion: '2024-11-05',
} as const;

export const MCP_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false, subscribe: false },
  prompts: { listChanged: false },
  logging: {},
} as const;

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'submit_lead',
    description:
      'Registra una solicitud de contacto o cotización en Imprima. Úsalo cuando el usuario quiera que un asesor comercial lo contacte para cotizar suministros corporativos.',
    inputSchema: {
      type: 'object',
      required: ['nombre', 'email', 'mensaje'],
      properties: {
        nombre: { type: 'string', minLength: 2, maxLength: 120 },
        email: { type: 'string', format: 'email' },
        telefono: { type: 'string' },
        empresa: { type: 'string' },
        mensaje: { type: 'string', minLength: 5, maxLength: 2000 },
        origen: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'browse_catalog',
    description:
      'Obtiene el catálogo público de productos corporativos de Imprima, opcionalmente filtrado por ID de categoría.',
    inputSchema: {
      type: 'object',
      properties: {
        categoria_id: { type: 'string' },
        formato: { type: 'string', enum: ['html', 'markdown'], default: 'markdown' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_contact_info',
    description:
      'Devuelve los canales de contacto oficiales de Imprima (teléfono, email, dirección, horario).',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Ejecuta una tool MCP server-side llamando a las APIs públicas de Imprima. */
export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string
): Promise<McpToolCallResult> {
  try {
    switch (name) {
      case 'submit_lead': {
        const res = await fetch(baseUrl + '/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...args, origen: (args.origen as string) || 'mcp' }),
        });
        const body = await res.text();
        if (!res.ok) {
          return {
            content: [{ type: 'text', text: 'Error ' + res.status + ': ' + body }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: body }] };
      }

      case 'browse_catalog': {
        const cat = args.categoria_id
          ? '?categoria=' + encodeURIComponent(String(args.categoria_id))
          : '';
        const url = baseUrl + '/catalogo' + cat;
        const accept = args.formato === 'html' ? 'text/html' : 'text/markdown';
        const res = await fetch(url, { headers: { Accept: accept } });
        const body = await res.text();
        return { content: [{ type: 'text', text: body }] };
      }

      case 'get_contact_info': {
        const res = await fetch(baseUrl + '/.well-known/agent-manifest.json', {
          headers: { Accept: 'application/json' },
        });
        const manifest = (await res.json()) as { contact?: unknown };
        return {
          content: [{ type: 'text', text: JSON.stringify(manifest.contact ?? null, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: 'Unknown tool: ' + name }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: 'Tool execution failed: ' + message }],
      isError: true,
    };
  }
}
