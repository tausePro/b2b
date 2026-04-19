/**
 * Script WebMCP (navigator.modelContext.provideContext) como string para
 * inyectar inline en el <head> con dangerouslySetInnerHTML.
 *
 * Debe correr ANTES de la hydration de React para que los agentes IA que
 * carguen la página detecten las tools en el primer paint.
 *
 * El contenido del script se genera server-side con la URL base correcta,
 * pero la ejecución es client-only (guard con `typeof navigator`).
 */

export interface WebMCPScriptOptions {
  origin: string;
}

export function buildWebMCPInlineScript({ origin }: WebMCPScriptOptions): string {
  // IIFE en string. Evitamos template interpolation en runtime porque el
  // único valor dinámico es `origin` que ya sanitizamos aquí al build-time.
  const safeOrigin = JSON.stringify(origin);

  return `
(function(){
  try {
    if (typeof navigator === 'undefined' || !navigator.modelContext || typeof navigator.modelContext.provideContext !== 'function') {
      return;
    }
    var ORIGIN = ${safeOrigin};
    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'submit_lead',
          description: 'Registra una solicitud de contacto o cotización en Imprima. Úsalo cuando el usuario quiera que un asesor comercial lo contacte para cotizar suministros corporativos.',
          inputSchema: {
            type: 'object',
            required: ['nombre', 'email', 'mensaje'],
            properties: {
              nombre:   { type: 'string', minLength: 2, maxLength: 120, description: 'Nombre completo del contacto' },
              email:    { type: 'string', format: 'email', description: 'Email de contacto' },
              telefono: { type: 'string', description: 'Teléfono (opcional, preferible con código de país)' },
              empresa:  { type: 'string', description: 'Nombre de la empresa (opcional pero recomendado)' },
              mensaje:  { type: 'string', minLength: 5, maxLength: 2000, description: 'Detalle de la necesidad' },
              origen:   { type: 'string', description: 'Origen del lead (opcional)' }
            }
          },
          execute: async function(input) {
            var res = await fetch(ORIGIN + '/api/leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.assign({}, input, { origen: input.origen || 'webmcp' }))
            });
            if (!res.ok) throw new Error('Lead submission failed: ' + res.status);
            return await res.json();
          }
        },
        {
          name: 'browse_catalog',
          description: 'Obtiene el catálogo público de productos corporativos de Imprima, opcionalmente filtrado por ID de categoría.',
          inputSchema: {
            type: 'object',
            properties: {
              categoria_id: { type: 'string', description: 'ID de categoría Odoo (opcional)' },
              formato:      { type: 'string', enum: ['html', 'markdown'], default: 'markdown' }
            }
          },
          execute: async function(input) {
            var cat = input.categoria_id ? ('?categoria=' + encodeURIComponent(input.categoria_id)) : '';
            var url = ORIGIN + '/catalogo' + cat;
            var accept = input.formato === 'html' ? 'text/html' : 'text/markdown';
            var res = await fetch(url, { headers: { Accept: accept } });
            return { url: url, status: res.status, contentType: res.headers.get('content-type'), body: await res.text() };
          }
        },
        {
          name: 'get_contact_info',
          description: 'Devuelve los canales de contacto oficiales de Imprima (teléfono, email, dirección, horario).',
          inputSchema: { type: 'object', properties: {} },
          execute: async function() {
            var res = await fetch(ORIGIN + '/.well-known/agent-manifest.json', { headers: { Accept: 'application/json' } });
            var manifest = await res.json();
            return manifest.contact || null;
          }
        }
      ]
    });
    // Flag visible en el DOM para detección externa del soporte WebMCP.
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-webmcp', 'registered');
    }
  } catch (e) {
    // Silent: soporte WebMCP opcional.
    if (typeof console !== 'undefined') {
      console.warn('[WebMCP] register failed', e);
    }
  }
})();
`.trim();
}
