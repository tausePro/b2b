import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { configFromParams, getConfigFromEnv, type OdooConfig } from '@/lib/odoo/client';

type OdooConfigRow = {
  id: string;
  odoo_url: string;
  odoo_db: string;
  odoo_username: string;
  odoo_password: string;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey);
}

export async function getStoredOdooConfig(): Promise<OdooConfig | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('odoo_configs')
    .select('id, odoo_url, odoo_db, odoo_username, odoo_password')
    .is('empresa_id', null)
    .maybeSingle<OdooConfigRow>();

  if (error) {
    console.warn('[OdooConfig] No se pudo leer la configuración guardada:', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  if (!data.odoo_url || !data.odoo_db || !data.odoo_username || !data.odoo_password) {
    console.warn('[OdooConfig] La configuración guardada está incompleta para el registro global:', data.id);
    return null;
  }

  return configFromParams({
    url: data.odoo_url,
    db: data.odoo_db,
    username: data.odoo_username,
    password: data.odoo_password,
  });
}

export async function getServerOdooConfig(): Promise<OdooConfig | null> {
  const storedConfig = await getStoredOdooConfig();

  if (storedConfig) {
    return storedConfig;
  }

  return getConfigFromEnv();
}
