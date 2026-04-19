import { NextResponse } from 'next/server';

export const revalidate = 3600;

/**
 * /.well-known/openid-configuration
 *
 * OpenID Connect Discovery document
 * (http://openid.net/specs/openid-connect-discovery-1_0.html).
 *
 * Imprima delega la autenticación a Supabase Auth. Este endpoint hace mirror
 * del openid-configuration oficial de Supabase, asegurando que los endpoints
 * siempre estén sincronizados con el authorization server real.
 *
 * Si por alguna razón Supabase no responde, caemos a una configuración
 * mínima construida desde NEXT_PUBLIC_SUPABASE_URL.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');

  if (!supabaseUrl) {
    return NextResponse.json(
      { error: 'OAuth/OIDC provider not configured' },
      { status: 503 }
    );
  }

  const issuer = supabaseUrl + '/auth/v1';
  const discoveryUrl = issuer + '/.well-known/openid-configuration';

  // Intentamos mirror directo del discovery document de Supabase.
  try {
    // El caching vive en el route handler (`export const revalidate = 3600`).
    const res = await fetch(discoveryUrl, {
      headers: { Accept: 'application/json' },
      cache: 'force-cache',
    });

    if (res.ok) {
      const upstream = await res.json();
      return NextResponse.json(upstream, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch {
    // Fallback abajo.
  }

  // Fallback: configuración mínima construida desde la URL de Supabase.
  // Basado en el discovery real de Supabase Auth (GoTrue).
  const fallback = {
    issuer,
    authorization_endpoint: issuer + '/authorize',
    token_endpoint: issuer + '/token',
    userinfo_endpoint: issuer + '/user',
    jwks_uri: issuer + '/jwks',
    revocation_endpoint: issuer + '/logout',
    response_types_supported: ['code', 'token', 'id_token'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'password'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256', 'plain'],
  };

  return NextResponse.json(fallback, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
