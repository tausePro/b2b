import { NextResponse } from 'next/server';
import { computeSkillDigest, getSkillBySlug } from '@/lib/agent-skills/skills';

export const revalidate = 3600;

/**
 * /.well-known/agent-skills/[slug]/SKILL.md
 *
 * Sirve el contenido Markdown del skill con frontmatter YAML según la spec
 * de https://agentskills.io/specification.
 *
 * El sha256 del contenido se expone también como header `Digest` (RFC 9530)
 * para facilitar la verificación por parte del agente consumidor.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const skill = getSkillBySlug(slug);

  if (!skill) {
    return new NextResponse('Skill not found', { status: 404 });
  }

  const digest = computeSkillDigest(skill.content);

  return new NextResponse(skill.content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // RFC 9530 Digest header (simplificado: incluimos solo el hash).
      'Digest': digest,
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
