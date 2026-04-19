import { NextRequest, NextResponse } from 'next/server';
import { estimateMarkdownTokens, getMarkdownForPath } from '@/lib/landing/getMarkdown';
import { LANDING_CACHE_REVALIDATE } from '@/lib/landing/getContenido';

export const revalidate = LANDING_CACHE_REVALIDATE;

/**
 * /api/md/[...path] — sirve la versión Markdown de una ruta pública.
 *
 * No se llama directamente por el usuario: el proxy (src/proxy.ts) hace
 * rewrite interno desde las rutas públicas cuando el request tiene
 * `Accept: text/markdown`. Este handler también puede invocarse como
 * `/api/md/faq` directo si algún cliente lo prefiere explícito.
 *
 * Responde con:
 *  - content-type: text/markdown; charset=utf-8
 *  - vary: Accept
 *  - x-markdown-tokens: <n>
 *  - content-signal: ai-train=yes, search=yes, ai-input=yes
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  // Sentinel 'home' = raíz '/'. Es necesario porque catch-all requiere
  // al menos un segmento y el proxy mapea '/' → '/api/md/home'.
  const joined = !Array.isArray(path) || path.length === 0 || (path.length === 1 && path[0] === 'home')
    ? '/'
    : '/' + path.join('/');

  const md = await getMarkdownForPath(joined);
  if (!md) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const tokens = estimateMarkdownTokens(md.full);

  return new NextResponse(md.full, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Vary': 'Accept',
      'X-Markdown-Tokens': String(tokens),
      'Content-Signal': 'ai-train=yes, search=yes, ai-input=yes',
      'Cache-Control': 'public, max-age=0, s-maxage=' + LANDING_CACHE_REVALIDATE + ', stale-while-revalidate=86400',
    },
  });
}
