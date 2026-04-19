import { NextResponse } from 'next/server';
import { AGENT_SKILLS, computeSkillDigest, getSkillUrl } from '@/lib/agent-skills/skills';

export const revalidate = 3600;

/**
 * /.well-known/agent-skills/index.json
 *
 * Agent Skills Discovery Index v0.2.0
 * (https://github.com/cloudflare/agent-skills-discovery-rfc).
 *
 * Expone el catálogo de skills disponibles para agentes IA con:
 *   - $schema: URL del schema de la spec.
 *   - skills[]: array con { name, type, description, url, digest }.
 *
 * El digest sha256 se calcula sobre el contenido exacto del SKILL.md
 * servido en su URL, garantizando integridad.
 */
export async function GET() {
  const skillsIndex = AGENT_SKILLS.map((s) => ({
    name: s.name,
    type: s.type,
    description: s.description,
    url: getSkillUrl(s.slug),
    digest: computeSkillDigest(s.content),
  }));

  const payload = {
    $schema: 'https://raw.githubusercontent.com/cloudflare/agent-skills-discovery-rfc/main/schema/v0.2.0/index.schema.json',
    version: '0.2.0',
    skills: skillsIndex,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
