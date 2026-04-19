import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';
import {
  MCP_CAPABILITIES,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  executeMcpTool,
} from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

/**
 * /api/mcp — Model Context Protocol server over HTTP (JSON-RPC 2.0).
 *
 * Transport: Streamable HTTP (POST con JSON body).
 * Métodos soportados: initialize, tools/list, tools/call, ping.
 *
 * Spec: https://modelcontextprotocol.io/specification
 * Server Card en: /.well-known/mcp/server-card.json
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

async function handleSingle(req: JsonRpcRequest, baseUrl: string): Promise<JsonRpcResponse> {
  switch (req.method) {
    case 'initialize':
      return rpcResult(req.id, {
        protocolVersion: MCP_SERVER_INFO.protocolVersion,
        capabilities: MCP_CAPABILITIES,
        serverInfo: {
          name: MCP_SERVER_INFO.name,
          version: MCP_SERVER_INFO.version,
          title: MCP_SERVER_INFO.title,
        },
      });

    case 'notifications/initialized':
    case 'initialized':
      // Notificación sin respuesta requerida.
      return rpcResult(req.id, {});

    case 'ping':
      return rpcResult(req.id, {});

    case 'tools/list':
      return rpcResult(req.id, { tools: MCP_TOOLS });

    case 'tools/call': {
      const params = req.params ?? {};
      const name = params.name as string | undefined;
      const args = (params.arguments as Record<string, unknown>) ?? {};
      if (!name) {
        return rpcError(req.id, -32602, 'Missing tool name');
      }
      const result = await executeMcpTool(name, args, baseUrl);
      return rpcResult(req.id, result);
    }

    case 'resources/list':
      return rpcResult(req.id, { resources: [] });

    case 'prompts/list':
      return rpcResult(req.id, { prompts: [] });

    default:
      return rpcError(req.id, -32601, 'Method not found: ' + req.method);
  }
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error: invalid JSON'), { status: 400 });
  }

  const baseUrl = getSiteUrl();

  // JSON-RPC batch: array de requests.
  if (Array.isArray(payload)) {
    const responses = await Promise.all(
      payload.map((r) => handleSingle(r as JsonRpcRequest, baseUrl))
    );
    return NextResponse.json(responses, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json(rpcError(null, -32600, 'Invalid Request'), { status: 400 });
  }

  const response = await handleSingle(payload as JsonRpcRequest, baseUrl);
  return NextResponse.json(response, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

/** GET devuelve info descriptiva para debugging (no es parte del protocolo). */
export async function GET() {
  return NextResponse.json(
    {
      server: MCP_SERVER_INFO,
      capabilities: MCP_CAPABILITIES,
      transport: 'http',
      endpoint: getSiteUrl() + '/api/mcp',
      description: 'MCP server de Imprima. Usar POST con JSON-RPC 2.0 payloads (initialize, tools/list, tools/call).',
      serverCard: getSiteUrl() + '/.well-known/mcp/server-card.json',
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
