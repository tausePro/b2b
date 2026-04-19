import type { NextConfig } from "next";

// Link headers expuestos en todas las rutas públicas para que los agentes IA
// descubran los recursos agent-ready sin hacer crawling adicional.
// Spec: https://datatracker.ietf.org/doc/html/rfc8288
const AGENT_LINK_HEADER = [
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</llms.txt>; rel="llms-txt"; type="text/plain"',
  '</.well-known/agent-manifest.json>; rel="https://agents.cloudflare.com/manifest"; type="application/json"',
  '</.well-known/openapi.json>; rel="service-desc"; type="application/json"',
].join(', ');

const nextConfig: NextConfig = {
  reactCompiler: true,

  async headers() {
    return [
      {
        // Aplica a todas las rutas; los agentes que pidan solo HEAD / GET
        // al home o cualquier página verán los Link rels disponibles.
        source: '/:path*',
        headers: [
          { key: 'Link', value: AGENT_LINK_HEADER },
          // Content Signals policy (https://blog.cloudflare.com/content-signals/)
          // Permitimos entrenamiento, search indexing y uso como input de agente.
          { key: 'Content-Signal', value: 'ai-train=yes, search=yes, ai-input=yes' },
          // CRÍTICO para Markdown for Agents: indica al CDN de Vercel que el
          // Accept header varía la respuesta (rewrite interno a /api/md/*).
          // Sin esto, Vercel cachea solo la primera variante (HTML o MD) y
          // sirve la misma para ambos tipos de request.
          { key: 'Vary', value: 'Accept' },
        ],
      },
    ];
  },
};

export default nextConfig;
