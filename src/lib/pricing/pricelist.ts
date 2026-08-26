import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  loadPricelistRuleSet,
  read,
  type OdooSession,
  type PricelistRuleSet,
} from '@/lib/odoo/client';

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Tarifa (pricelist) que Odoo tiene asignada al cliente.
 *
 * Es la misma que se envía al crear la cotización, así que el precio que
 * calculamos y el que Odoo aplicaría en el documento salen de la misma fuente.
 */
export async function getEmpresaPricelistId(
  empresaId: string,
  session: OdooSession
): Promise<number | null> {
  const admin = getAdmin();

  const { data: empresa } = await admin
    .from('empresas')
    .select('odoo_partner_id')
    .eq('id', empresaId)
    .maybeSingle<{ odoo_partner_id: number | null }>();

  const partnerId = empresa?.odoo_partner_id ? Number(empresa.odoo_partner_id) : null;
  if (!partnerId) return null;

  const partnerRows = await read(
    'res.partner',
    [partnerId],
    ['id', 'property_product_pricelist'],
    session
  );

  const pricelist = partnerRows[0]?.property_product_pricelist;
  return Array.isArray(pricelist) ? Number(pricelist[0]) : null;
}

/**
 * Reglas de la tarifa del cliente, listas para resolver precios por variante.
 *
 * Devuelve `null` si el cliente no tiene tarifa asignada en Odoo; en ese caso el
 * llamador debe conservar su comportamiento actual en vez de inventar precios.
 */
export async function loadEmpresaPricelistRules(
  empresaId: string,
  session: OdooSession
): Promise<PricelistRuleSet | null> {
  const pricelistId = await getEmpresaPricelistId(empresaId, session);
  if (!pricelistId) return null;
  return loadPricelistRuleSet(session, pricelistId);
}
