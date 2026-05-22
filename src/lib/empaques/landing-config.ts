import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { EMPAQUES_SLUG, EmpaquesConfigurationError } from '@/lib/empaques/catalogo';
import {
  normalizeLandingConfig,
  type EmpaquesLandingConfig,
} from '@/lib/empaques/landing-config-shared';

export {
  DEFAULT_LANDING_CONFIG,
  LANDING_BENEFIT_ICONS,
  landingConfigToExtra,
  normalizeLandingConfig,
} from '@/lib/empaques/landing-config-shared';
export type {
  EmpaquesLandingBenefitItem,
  EmpaquesLandingBenefits,
  EmpaquesLandingConfig,
  EmpaquesLandingHero,
  LandingBenefitIcon,
} from '@/lib/empaques/landing-config-shared';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new EmpaquesConfigurationError('Configuración de Supabase no encontrada para resolver Empaques.');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey);
}

/**
 * Carga la landing config del storefront de Empaques con fallback a los
 * defaults si la fila no existe o si `configuracion_extra` no tiene la sección.
 * Nunca lanza por datos incompletos: solo lanza si Supabase falla.
 */
export async function getEmpaquesLandingConfig(): Promise<EmpaquesLandingConfig> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('storefront_configs')
      .select('configuracion_extra')
      .eq('slug', EMPAQUES_SLUG)
      .maybeSingle();

    if (error) {
      throw new EmpaquesConfigurationError(error.message);
    }

    return normalizeLandingConfig(data?.configuracion_extra);
  } catch (error) {
    if (error instanceof EmpaquesConfigurationError) throw error;
    throw new EmpaquesConfigurationError(
      error instanceof Error ? error.message : 'No se pudo resolver la landing config de Empaques.',
    );
  }
}
