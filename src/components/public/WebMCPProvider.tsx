'use client';

import { useEffect } from 'react';

/**
 * WebMCPProvider
 *
 * Expone las acciones públicas de Imprima como tools del API WebMCP
 * (https://webmachinelearning.github.io/webmcp/) para que agentes IA
 * que corran en el browser del usuario puedan invocarlas directamente.
 *
 * Tools expuestas:
 *  - submit_lead:      envía un lead al endpoint público /api/leads.
 *  - browse_catalog:   redirige al catálogo, opcionalmente filtrado por categoría.
 *  - get_contact_info: devuelve los canales de contacto oficiales.
 *
 * Se monta en el PublicLayout. Si `navigator.modelContext` no existe
 * (browser sin soporte WebMCP), el provider queda inactivo sin romper nada.
 */

// Tipado mínimo del API WebMCP en el navegador.
type WebMCPTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};
type WebMCPContext = { tools: WebMCPTool[] };
type WebMCPNavigator = Navigator & {
  modelContext?: {
    provideContext: (ctx: WebMCPContext) => void;
  };
};

export default function WebMCPProvider() {
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as WebMCPNavigator) : null;
    if (!nav?.modelContext?.provideContext) {
      // Browser sin soporte WebMCP (la mayoría hoy). No hacemos nada.
      return;
    }

    const origin = window.location.origin;

    nav.modelContext.provideContext({
      tools: [
        {
          name: 'submit_lead',
          description:
            'Registra una solicitud de contacto o cotización en Imprima. Úsalo cuando el usuario quiera que un asesor comercial lo contacte para cotizar suministros corporativos.',
          inputSchema: {
            type: 'object',
            required: ['nombre', 'email', 'mensaje'],
            properties: {
              nombre: { type: 'string', minLength: 2, maxLength: 120, description: 'Nombre completo del contacto' },
              email: { type: 'string', format: 'email', description: 'Email de contacto' },
              telefono: { type: 'string', description: 'Teléfono (opcional, preferible con código de país)' },
              empresa: { type: 'string', description: 'Nombre de la empresa (opcional pero recomendado)' },
              mensaje: { type: 'string', minLength: 5, maxLength: 2000, description: 'Detalle de la necesidad o producto de interés' },
              origen: { type: 'string', description: 'Origen del lead (opcional, ej. "agente-ia")' },
            },
          },
          execute: async (input) => {
            const res = await fetch(origin + '/api/leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...input, origen: (input.origen as string) || 'webmcp' }),
            });
            if (!res.ok) {
              throw new Error('Lead submission failed: ' + res.status);
            }
            return await res.json();
          },
        },
        {
          name: 'browse_catalog',
          description:
            'Obtiene el catálogo público de productos corporativos de Imprima, opcionalmente filtrado por ID de categoría.',
          inputSchema: {
            type: 'object',
            properties: {
              categoria_id: { type: 'string', description: 'ID de categoría Odoo (opcional)' },
              formato: { type: 'string', enum: ['html', 'markdown'], default: 'markdown' },
            },
          },
          execute: async (input) => {
            const categoria = input.categoria_id ? '?categoria=' + encodeURIComponent(String(input.categoria_id)) : '';
            const url = origin + '/catalogo' + categoria;
            const accept = input.formato === 'html' ? 'text/html' : 'text/markdown';
            const res = await fetch(url, { headers: { Accept: accept } });
            return {
              url,
              status: res.status,
              contentType: res.headers.get('content-type'),
              body: await res.text(),
            };
          },
        },
        {
          name: 'get_contact_info',
          description:
            'Devuelve los canales de contacto oficiales de Imprima (teléfono, email, dirección, horario).',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => {
            const res = await fetch(origin + '/.well-known/agent-manifest.json', {
              headers: { Accept: 'application/json' },
            });
            const manifest = await res.json();
            return manifest.contact ?? null;
          },
        },
      ],
    });
  }, []);

  return null;
}
