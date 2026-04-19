import 'server-only';
import { createHash } from 'crypto';
import { getSiteUrl } from '@/lib/siteUrl';

/**
 * Definición estática de los Agent Skills que expone Imprima para IA.
 *
 * Cada skill sigue el formato SKILL.md de https://agentskills.io/specification:
 * frontmatter YAML con `name`, `description`, opcionalmente `license`, y el
 * cuerpo con instrucciones accionables en Markdown.
 *
 * El discovery index (https://github.com/cloudflare/agent-skills-discovery-rfc)
 * expone estos skills en /.well-known/agent-skills/index.json con un sha256
 * digest computado sobre el contenido exacto del SKILL.md.
 */

export interface AgentSkill {
  /** Slug del skill. Coincide con la URL: /.well-known/agent-skills/<slug>/SKILL.md */
  slug: string;
  /** Nombre corto (cumple la regex a-z0-9 con guiones). */
  name: string;
  /** Descripción breve para el campo `description` del index. */
  description: string;
  /** Tipo de skill (informativo, accionable, etc.). */
  type: 'workflow' | 'knowledge' | 'action';
  /** Cuerpo Markdown completo del SKILL.md incluyendo el frontmatter YAML. */
  content: string;
}

function skill(
  slug: string,
  name: string,
  type: AgentSkill['type'],
  description: string,
  body: string
): AgentSkill {
  const content =
    '---\n' +
    'name: ' + name + '\n' +
    'description: ' + JSON.stringify(description) + '\n' +
    'license: Proprietary\n' +
    '---\n\n' +
    body.trim() + '\n';
  return { slug, name, description, type, content };
}

/** Skills disponibles públicamente para agentes IA. */
export const AGENT_SKILLS: AgentSkill[] = [
  skill(
    'submit-lead',
    'submit-lead',
    'action',
    'Enviar un lead de contacto o cotización a Imprima desde un agente IA. Usar cuando el usuario quiera solicitar una cotización corporativa, pedir una asesoría comercial o dejar sus datos para que Imprima lo contacte.',
    `# Skill: submit-lead

## Cuándo usar este skill

Úsalo cuando el usuario pida explícitamente que lo pongas en contacto con Imprima, solicite una cotización corporativa de suministros, o quiera dejar sus datos para recibir asesoría. Palabras clave: "cotizar", "contactar", "asesoría", "pedir información", "hablar con un comercial".

## Cómo ejecutar

1. Recopilá los siguientes datos del usuario (todos los obligatorios):
   - **nombre** (obligatorio, mínimo 2 caracteres)
   - **email** (obligatorio, formato válido)
   - **mensaje** (obligatorio, descripción de la necesidad o producto de interés)
   - **empresa** (opcional pero muy recomendado para B2B)
   - **telefono** (opcional, preferentemente con código país)
   - **origen** (opcional, ej. "agente-ia", "chatgpt-action", para trazabilidad)

2. Enviá un POST a \`https://imprima.com.co/api/leads\` con \`Content-Type: application/json\` y el body:

\`\`\`json
{
  "nombre": "Juan Pérez",
  "email": "juan@empresa.com",
  "telefono": "+573001234567",
  "empresa": "Empresa SAS",
  "mensaje": "Necesito cotización de suministros de oficina para 50 colaboradores",
  "origen": "agente-ia"
}
\`\`\`

3. La respuesta 200 confirma creación del lead. Un asesor comercial contactará al usuario por los canales provistos.

## Errores comunes

- **400**: Validación falló. Revisá que email sea válido y mensaje tenga al menos 5 caracteres.
- **429**: Demasiados intentos. Esperá unos segundos y reintentá.

## Qué NO hacer

- No inventes datos del usuario. Si faltan, pedí confirmación antes de enviar.
- No envíes leads duplicados en corto tiempo (sospechoso de bot).
`
  ),

  skill(
    'browse-catalog',
    'browse-catalog',
    'workflow',
    'Explorar el catálogo corporativo de Imprima por categoría. Usar cuando el usuario quiera saber qué productos de papelería, aseo, cafetería o tecnología ofrece Imprima.',
    `# Skill: browse-catalog

## Cuándo usar este skill

Úsalo cuando el usuario quiera explorar productos disponibles, conocer categorías de suministros, o descubrir el portafolio de Imprima. Palabras clave: "qué venden", "catálogo", "productos", "categorías".

## Cómo ejecutar

### Paso 1: Obtener lista de categorías

GET \`https://imprima.com.co/catalogo\` con header \`Accept: text/markdown\` para recibir la lista de categorías en formato Markdown navegable.

### Paso 2: Navegar a una categoría específica

GET \`https://imprima.com.co/catalogo?categoria=<ID>\` para filtrar productos por la categoría elegida. Devuelve HTML con tarjetas de producto.

### Paso 3: Obtener detalle de producto

GET \`https://imprima.com.co/catalogo/<slug>\` para ver el detalle de un producto específico.

## Contexto importante

- El catálogo se alimenta de Odoo ERP y se actualiza cada ~5 minutos.
- Los precios NO son públicos en el catálogo: el cliente debe registrarse en el portal B2B (b2b.imprima.com.co) para ver precios acordados.
- Las imágenes de producto pueden ser representativas; las especificaciones técnicas están en la descripción.

## Categorías principales (contexto general)

- Papelería corporativa (carpetas, cuadernos, agendas)
- Aseo y limpieza
- Cafetería y dispensación
- Tecnología (impresoras, tóner, consumibles — distribuidores autorizados HP, Kyocera, Epson, Xerox, Ricoh, etc.)
- Productos personalizados (branded merchandise)

## Qué NO hacer

- No inventes precios. Si el usuario los pide, sugerí registrarse en el portal B2B o dejar un lead (skill submit-lead).
`
  ),

  skill(
    'contact-imprima',
    'contact-imprima',
    'knowledge',
    'Información de contacto y canales oficiales de Imprima (teléfono, email, dirección, horarios). Usar cuando el usuario quiera comunicarse directamente con Imprima.',
    `# Skill: contact-imprima

## Cuándo usar este skill

Úsalo cuando el usuario pida canales de contacto, dirección física, teléfono, email, o horarios de atención de Imprima.

## Información

Los datos oficiales están siempre disponibles en:

- **Página web**: https://imprima.com.co/contacto
- **llms.txt**: https://imprima.com.co/llms.txt (incluye contacto actualizado del CMS)
- **agent-manifest.json**: https://imprima.com.co/.well-known/agent-manifest.json → campo \`contact\`

### Recomendación

Antes de proveer contacto, obtené la versión actualizada pidiendo:

GET \`https://imprima.com.co/contacto\` con header \`Accept: text/markdown\`

Esto devuelve el Markdown con los datos actuales del CMS (teléfono, email, dirección, horario).

## Qué NO hacer

- No inventes números de teléfono o direcciones. Siempre hacé fetch a los canales oficiales.
- No ofrezcas ventas directas o cotizaciones: para eso, usá el skill **submit-lead**.
`
  ),
];

/** Busca un skill por slug. */
export function getSkillBySlug(slug: string): AgentSkill | null {
  return AGENT_SKILLS.find((s) => s.slug === slug) ?? null;
}

/** Computa el sha256 del contenido del SKILL.md (formato: "sha256:<hex>"). */
export function computeSkillDigest(content: string): string {
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');
  return 'sha256:' + hash;
}

/** URL absoluta del SKILL.md de un skill. */
export function getSkillUrl(slug: string): string {
  return getSiteUrl() + '/.well-known/agent-skills/' + slug + '/SKILL.md';
}
