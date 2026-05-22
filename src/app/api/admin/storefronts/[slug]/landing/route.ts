import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoles } from '@/lib/auth/apiRouteGuards';
import {
  getEmpaquesLandingConfig,
  landingConfigToExtra,
  normalizeLandingConfig,
} from '@/lib/empaques/landing-config';

const EDIT_ROLES = ['super_admin', 'direccion', 'editor_contenido'] as const;
const READ_ROLES = ['super_admin', 'direccion', 'editor_contenido', 'asesor'] as const;

/**
 * Devuelve la configuración de landing del storefront, ya normalizada con
 * defaults. Útil para hidratar el formulario del admin sin que tenga que
 * resolver fallbacks por su cuenta.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(READ_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  if (slug !== 'empaques') {
    return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });
  }

  try {
    const landing = await getEmpaquesLandingConfig();
    return NextResponse.json({ landing });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar la landing config.' },
      { status: 500 },
    );
  }
}

/**
 * Actualiza la sección `landing` y la `descripcion` dentro de
 * `configuracion_extra` del storefront. Se aceptan los mismos campos que
 * la forma normalizada; los faltantes caen a defaults para evitar perder
 * texto si el cliente envía un objeto parcial.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const auth = await authorizeApiRoles(EDIT_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await context.params;
  if (slug !== 'empaques') {
    return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'BODY_INVALIDO' }, { status: 400 });
  }

  const incoming = (body && typeof body === 'object') ? body as Record<string, unknown> : {};

  // El cliente puede mandar { descripcion, hero, ventajas } al raíz o anidados
  // bajo `landing`. Aceptamos ambas formas para resiliencia.
  const flattened: Record<string, unknown> = {
    descripcion: incoming.descripcion,
    landing: incoming.landing && typeof incoming.landing === 'object'
      ? incoming.landing
      : { hero: incoming.hero, ventajas: incoming.ventajas },
  };

  const normalized = normalizeLandingConfig(flattened);

  const { data: current, error: fetchError } = await auth.admin
    .from('storefront_configs')
    .select('id, configuracion_extra')
    .eq('slug', slug)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: 'STOREFRONT_NOT_FOUND' }, { status: 404 });
  }

  const currentExtra = (current.configuracion_extra && typeof current.configuracion_extra === 'object')
    ? current.configuracion_extra as Record<string, unknown>
    : {};

  const nextExtra = landingConfigToExtra(normalized, currentExtra);

  const { error: updateError } = await auth.admin
    .from('storefront_configs')
    .update({
      configuracion_extra: nextExtra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ landing: normalized });
}
