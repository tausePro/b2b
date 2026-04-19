import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/siteUrl';

/**
 * robots.txt dinámico.
 *
 * Estrategia:
 *  - Permitimos explícitamente a los principales AI crawlers de agentes
 *    (GPTBot, ClaudeBot, PerplexityBot, Applebot, Google-Extended, etc.)
 *    para que Imprima sea descubierto vía asistentes de IA.
 *  - Excluimos rutas privadas (dashboard, admin, api) para todos.
 *  - Incluimos la directiva Sitemap absoluta, requerida por los validadores
 *    de "agent-ready" y útil para SEO tradicional.
 */

const PRIVATE_PATHS = [
  '/dashboard/',
  '/admin/',
  '/api/',
  '/login',
  '/auth/',
];

// Crawlers de IA que respetan robots.txt. Los permitimos todos para maximizar
// descubrimiento por asistentes.  Si se necesita excluir alguno, basta con
// eliminarlo de la lista y/o agregarlo con disallow explícito.
const AI_BOTS_PERMITIDOS: readonly string[] = [
  // OpenAI
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Anthropic
  'ClaudeBot',
  'Claude-Web',
  'Claude-User',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google (Gemini / Bard)
  'Google-Extended',
  // Apple Intelligence
  'Applebot',
  'Applebot-Extended',
  // Meta
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'FacebookBot',
  // Microsoft / Bing
  'Bingbot',
  // You.com
  'YouBot',
  // Cohere
  'cohere-ai',
  // DuckDuckGo AI
  'DuckAssistBot',
  // Amazon
  'Amazonbot',
  // Mistral
  'MistralAI-User',
  // Common Crawl (alimenta muchos datasets públicos)
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  const rulesPorBot: MetadataRoute.Robots['rules'] = AI_BOTS_PERMITIDOS.map((userAgent) => ({
    userAgent,
    allow: '/',
    disallow: PRIVATE_PATHS,
  }));

  return {
    rules: [
      // Regla base para todos los user agents
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      ...rulesPorBot,
    ],
    sitemap: baseUrl + '/sitemap.xml',
    host: baseUrl,
  };
}
