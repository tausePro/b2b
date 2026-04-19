import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';

// Revalidación horaria del robots.txt (el contenido casi nunca cambia).
export const revalidate = 3600;

/**
 * /robots.txt — route handler manual porque Next 16 MetadataRoute.Robots no
 * permite directivas custom como `Content-Signal` dentro del documento.
 *
 * Incluye:
 *  - Allow/Disallow estándar.
 *  - AI bots permitidos explícitamente.
 *  - Content-Signal policy (https://contentsignals.org/,
 *    https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/):
 *    declara preferencias de uso del contenido del sitio por IA.
 *  - Sitemap + Host.
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  // AI bots permitidos (crawlers y user-agents conocidos de asistentes IA).
  // Lista curada del draft https://aibot.mediapartner.google / openai / anthropic,
  // más los emergentes (Perplexity, You.com, Meta AI, Apple Intelligence).
  const aiBots = [
    'GPTBot',                 // OpenAI — training
    'OAI-SearchBot',          // OpenAI — SearchGPT
    'ChatGPT-User',           // OpenAI — ChatGPT browsing
    'ClaudeBot',              // Anthropic
    'Claude-Web',             // Anthropic — web ingestion (legacy)
    'anthropic-ai',           // Anthropic — compat legacy
    'PerplexityBot',          // Perplexity
    'Perplexity-User',        // Perplexity user-triggered
    'Google-Extended',        // Google Gemini / AI Overviews
    'GoogleOther',            // Google misc
    'Applebot',               // Apple Intelligence indexing
    'Applebot-Extended',      // Apple Intelligence training
    'Meta-ExternalAgent',     // Meta AI
    'Meta-ExternalFetcher',   // Meta AI
    'Bingbot',                // Microsoft — Copilot / Bing
    'YouBot',                 // You.com
    'cohere-ai',              // Cohere
    'DuckAssistBot',          // DuckDuckGo AI
    'Amazonbot',              // Amazon (Alexa / Q)
    'MistralAI-User',         // Mistral
    'CCBot',                  // Common Crawl (training datasets)
  ];

  const lineas: string[] = [];

  // ── Reglas para todos los user-agents ──
  lineas.push('User-Agent: *');
  lineas.push('Allow: /');
  lineas.push('Disallow: /dashboard/');
  lineas.push('Disallow: /api/internal/');
  lineas.push('Disallow: /api/auth/');
  lineas.push('Disallow: /api/odoo/');
  lineas.push('Disallow: /login');
  lineas.push('');

  // ── AI bots permitidos explícitamente ──
  for (const bot of aiBots) {
    lineas.push('User-Agent: ' + bot);
    lineas.push('Allow: /');
    lineas.push('Disallow: /dashboard/');
    lineas.push('');
  }

  // ── Content Signals (https://contentsignals.org/) ──
  // Declaramos la política de uso del contenido por IA. Formato propuesto en
  // draft-romm-aipref-contentsignals. Aplica a todo el sitio por defecto.
  lineas.push('# Content Signals — https://contentsignals.org/');
  lineas.push('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
  lineas.push('');

  // ── Sitemap + Host ──
  lineas.push('Sitemap: ' + baseUrl + '/sitemap.xml');
  lineas.push('Host: ' + baseUrl.replace(/^https?:\/\//, ''));
  lineas.push('');

  const cuerpo = lineas.join('\n');

  return new NextResponse(cuerpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
