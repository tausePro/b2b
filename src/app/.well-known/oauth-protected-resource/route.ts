import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';

export const revalidate = 3600;

/**
 * /.well-known/oauth-protected-resource
 *
 * Metadata del recurso protegido según RFC 9728
 * (https://www.rfc-editor.org/rfc/rfc9728).
 *
 * Declara que imprima.com.co tiene APIs protegidas cuyos tokens son emitidos
 * por el authorization server de Supabase Auth. Un agente IA que quiera
 * acceder a endpoints autenticados puede leer este descriptor para saber
 * adónde pedir tokens.
 */
export async function GET() {
  const baseUrl = getSiteUrl();

  // El issuer de Supabase se deriva del proyecto. Tanto anon key como
  // project URL son públicos por diseño (viajan al cliente).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const authorizationServers = supabaseUrl ? [supabaseUrl + '/auth/v1'] : [];

  const resourceMeta = {
    resource: baseUrl,
    authorization_servers: authorizationServers,
    scopes_supported: ['openid', 'email', 'profile'],
    bearer_methods_supported: ['header'],
    resource_documentation: baseUrl + '/.well-known/openapi.json',
    resource_name: 'Imprima B2B Public API',
    // Tipos de tokens aceptados por Supabase Auth
    token_types_supported: ['Bearer'],
  };

  return NextResponse.json(resourceMeta, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
