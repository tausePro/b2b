/**
 * Cliente Odoo 18 - XML-RPC con API Key
 * Protocolo oficial: xmlrpc/2/common (auth) + xmlrpc/2/object (datos)
 * Soporta autenticación por API Key (recomendado) o password
 * Documentación: https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
 */

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  password: string;
  apiKey?: string;
}

export interface OdooSession {
  uid: number;
  config: OdooConfig;
}

// =============================================
// XML-RPC Transport
// =============================================

function buildXmlRpcCall(method: string, params: unknown[]): string {
  const encodeValue = (val: unknown): string => {
    if (val === null || val === undefined) return '<value><boolean>0</boolean></value>';
    if (typeof val === 'boolean') return `<value><boolean>${val ? 1 : 0}</boolean></value>`;
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return `<value><int>${val}</int></value>`;
      return `<value><double>${val}</double></value>`;
    }
    if (typeof val === 'string') {
      const escaped = val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return `<value><string>${escaped}</string></value>`;
    }
    if (Array.isArray(val)) {
      return `<value><array><data>${val.map(encodeValue).join('')}</data></array></value>`;
    }
    if (typeof val === 'object') {
      const members = Object.entries(val as Record<string, unknown>)
        .map(([k, v]) => `<member><name>${k}</name>${encodeValue(v)}</member>`)
        .join('');
      return `<value><struct>${members}</struct></value>`;
    }
    return `<value><string>${String(val)}</string></value>`;
  };

  const paramsXml = params.map((p) => `<param>${encodeValue(p)}</param>`).join('');
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramsXml}</params></methodCall>`;
}

// =============================================
// Parser XML-RPC robusto basado en tokenización
// Maneja correctamente estructuras anidadas
// =============================================

interface XmlToken {
  type: 'open' | 'close' | 'selfclose' | 'text';
  tag?: string;
  content?: string;
}

function tokenizeXml(xml: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let i = 0;
  while (i < xml.length) {
    if (xml[i] === '<') {
      const end = xml.indexOf('>', i);
      if (end === -1) break;
      const raw = xml.slice(i + 1, end);
      if (raw.startsWith('/')) {
        tokens.push({ type: 'close', tag: raw.slice(1).trim() });
      } else if (raw.endsWith('/')) {
        tokens.push({ type: 'selfclose', tag: raw.slice(0, -1).trim() });
      } else if (raw.startsWith('?') || raw.startsWith('!')) {
        // skip PI and comments
      } else {
        tokens.push({ type: 'open', tag: raw.trim() });
      }
      i = end + 1;
    } else {
      const end = xml.indexOf('<', i);
      const text = end === -1 ? xml.slice(i) : xml.slice(i, end);
      const trimmed = text.trim();
      if (trimmed) tokens.push({ type: 'text', content: trimmed });
      i = end === -1 ? xml.length : end;
    }
  }
  return tokens;
}

function parseTokens(tokens: XmlToken[], pos: { i: number }): unknown {
  const token = tokens[pos.i];
  if (!token) return null;

  if (token.type === 'selfclose') {
    if (token.tag === 'nil') { pos.i++; return null; }
    pos.i++;
    return null;
  }

  if (token.type !== 'open') return null;

  const tag = token.tag!;
  pos.i++;

  if (tag === 'value') {
    const next = tokens[pos.i];
    let result: unknown;

    if (!next) { result = null; }
    else if (next.type === 'text') {
      // <value>texto</value> — string implícito
      result = next.content!
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      pos.i++;
    } else if (next.type === 'selfclose' && next.tag === 'nil') {
      result = null;
      pos.i++;
    } else if (next.type === 'open') {
      result = parseTokens(tokens, pos);
    } else {
      result = null;
    }

    // consume </value>
    if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'value') pos.i++;
    return result;
  }

  if (tag === 'int' || tag === 'i4' || tag === 'i8') {
    const t = tokens[pos.i];
    const v = t?.type === 'text' ? parseInt(t.content!, 10) : 0;
    if (t?.type === 'text') pos.i++;
    if (tokens[pos.i]?.type === 'close') pos.i++;
    return v;
  }

  if (tag === 'double') {
    const t = tokens[pos.i];
    const v = t?.type === 'text' ? parseFloat(t.content!) : 0;
    if (t?.type === 'text') pos.i++;
    if (tokens[pos.i]?.type === 'close') pos.i++;
    return v;
  }

  if (tag === 'boolean') {
    const t = tokens[pos.i];
    const v = t?.type === 'text' ? t.content === '1' : false;
    if (t?.type === 'text') pos.i++;
    if (tokens[pos.i]?.type === 'close') pos.i++;
    return v;
  }

  if (tag === 'string') {
    const t = tokens[pos.i];
    let v = '';
    if (t?.type === 'text') {
      v = t.content!.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      pos.i++;
    }
    if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'string') pos.i++;
    return v;
  }

  if (tag === 'nil') {
    if (tokens[pos.i]?.type === 'close') pos.i++;
    return null;
  }

  if (tag === 'array') {
    // consume <data>
    if (tokens[pos.i]?.type === 'open' && tokens[pos.i]?.tag === 'data') pos.i++;
    const items: unknown[] = [];
    while (pos.i < tokens.length) {
      const cur = tokens[pos.i];
      if (cur?.type === 'close' && (cur.tag === 'data' || cur.tag === 'array')) break;
      if (cur?.type === 'open' && cur.tag === 'value') {
        items.push(parseTokens(tokens, pos));
      } else {
        pos.i++;
      }
    }
    // consume </data> and </array>
    if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'data') pos.i++;
    if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'array') pos.i++;
    return items;
  }

  if (tag === 'struct') {
    const obj: Record<string, unknown> = {};
    while (pos.i < tokens.length) {
      const cur = tokens[pos.i];
      if (cur?.type === 'close' && cur.tag === 'struct') break;
      if (cur?.type === 'open' && cur.tag === 'member') {
        pos.i++; // consume <member>
        // <name>
        let key = '';
        if (tokens[pos.i]?.type === 'open' && tokens[pos.i]?.tag === 'name') {
          pos.i++;
          if (tokens[pos.i]?.type === 'text') { key = tokens[pos.i].content!; pos.i++; }
          if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'name') pos.i++;
        }
        // <value>
        let val: unknown = null;
        if (tokens[pos.i]?.type === 'open' && tokens[pos.i]?.tag === 'value') {
          val = parseTokens(tokens, pos);
        }
        obj[key] = val;
        // consume </member>
        if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'member') pos.i++;
      } else {
        pos.i++;
      }
    }
    if (tokens[pos.i]?.type === 'close' && tokens[pos.i]?.tag === 'struct') pos.i++;
    return obj;
  }

  // tag desconocido: consumir hasta el cierre
  while (pos.i < tokens.length) {
    const cur = tokens[pos.i];
    if (cur?.type === 'close' && cur.tag === tag) { pos.i++; break; }
    pos.i++;
  }
  return null;
}

function parseXmlRpcResponse(xml: string): unknown {
  if (xml.includes('<fault>')) {
    const faultMatch = xml.match(/<string>([^<]*)<\/string>/);
    throw new Error(`Odoo XML-RPC Fault: ${faultMatch?.[1] || 'Error desconocido'}`);
  }

  const tokens = tokenizeXml(xml);

  // Buscar el primer <value> dentro de <params><param>
  let paramStart = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'open' && tokens[i].tag === 'value') {
      paramStart = i;
      break;
    }
  }

  if (paramStart === -1) throw new Error('Respuesta XML-RPC inválida: no se encontró <value>');

  const pos = { i: paramStart };
  return parseTokens(tokens, pos);
}

async function xmlRpcCall(
  endpoint: string,
  method: string,
  params: unknown[]
): Promise<unknown> {
  const body = buildXmlRpcCall(method, params);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 300)}`);
  }

  const xml = await response.text();
  return parseXmlRpcResponse(xml);
}

// =============================================
// Config helpers
// =============================================

export function getConfigFromEnv(): OdooConfig | null {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const password = process.env.ODOO_PASSWORD;
  const apiKey = process.env.ODOO_API_KEY;

  if (!url || !db || !username || !password) return null;
  return { url, db, username, password, apiKey };
}

export function configFromParams(params: {
  url: string;
  db: string;
  username: string;
  password: string;
  apiKey?: string;
}): OdooConfig {
  return { ...params };
}

function getConfig(): OdooConfig {
  const config = getConfigFromEnv();
  if (!config) {
    throw new Error('Faltan variables de entorno ODOO_URL, ODOO_DB, ODOO_USERNAME o ODOO_PASSWORD');
  }
  return config;
}

// =============================================
// Autenticación
// =============================================

export async function authenticate(cfg?: OdooConfig): Promise<OdooSession> {
  const config = cfg || getConfig();
  const endpoint = `${config.url}/xmlrpc/2/common`;

  // authenticate() siempre usa password (no API Key)
  const uid = await xmlRpcCall(endpoint, 'authenticate', [
    config.db,
    config.username,
    config.password,
    {},
  ]) as number;

  if (!uid || typeof uid !== 'number' || uid === 0) {
    throw new Error(`Autenticación fallida. UID recibido: ${uid}. Verifica credenciales y DB.`);
  }

  return { uid, config };
}

export async function getServerVersion(cfg?: OdooConfig): Promise<unknown> {
  const config = cfg || getConfig();
  return xmlRpcCall(`${config.url}/xmlrpc/2/common`, 'version', []);
}

// =============================================
// execute_kw — método base para todas las queries
// =============================================

async function executeKw(
  session: OdooSession,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  // Odoo 18: execute_kw usa password (la API Key se usa solo si está habilitada en el perfil)
  const credential = session.config.password;
  return xmlRpcCall(
    `${session.config.url}/xmlrpc/2/object`,
    'execute_kw',
    [session.config.db, session.uid, credential, model, method, args, kwargs]
  );
}

// =============================================
// Métodos genéricos
// =============================================

export async function searchRead(
  model: string,
  domain: unknown[] = [],
  fields: string[] = [],
  options: { limit?: number; offset?: number; order?: string; config?: OdooConfig; session?: OdooSession } = {}
): Promise<Record<string, unknown>[]> {
  const session = options.session || await authenticate(options.config);
  const kwargs: Record<string, unknown> = {};
  if (fields.length > 0) kwargs.fields = fields;
  if (options.limit !== undefined) kwargs.limit = options.limit;
  if (options.offset !== undefined) kwargs.offset = options.offset;
  if (options.order) kwargs.order = options.order;

  const result = await executeKw(session, model, 'search_read', [domain], kwargs);
  return result as Record<string, unknown>[];
}

export async function searchCount(
  model: string,
  domain: unknown[] = [],
  session?: OdooSession,
  cfg?: OdooConfig
): Promise<number> {
  const s = session || await authenticate(cfg);
  const result = await executeKw(s, model, 'search_count', [domain]);
  return result as number;
}

export async function read(
  model: string,
  ids: number[],
  fields: string[] = [],
  session?: OdooSession,
  cfg?: OdooConfig
): Promise<Record<string, unknown>[]> {
  const s = session || await authenticate(cfg);
  const kwargs: Record<string, unknown> = {};
  if (fields.length > 0) kwargs.fields = fields;
  const result = await executeKw(s, model, 'read', [ids], kwargs);
  return result as Record<string, unknown>[];
}

export async function create(
  model: string,
  values: Record<string, unknown>,
  session?: OdooSession,
  cfg?: OdooConfig
): Promise<number> {
  const s = session || await authenticate(cfg);
  const result = await executeKw(s, model, 'create', [values]);
  return result as number;
}

export async function fieldsGet(
  model: string,
  attributes: string[] = ['string', 'type', 'required'],
  session?: OdooSession,
  cfg?: OdooConfig
): Promise<Record<string, unknown>> {
  const s = session || await authenticate(cfg);
  const result = await executeKw(s, model, 'fields_get', [], { attributes });
  return result as Record<string, unknown>;
}

// =============================================
// Métodos de negocio específicos para Imprima B2B
// =============================================

export interface OdooPartner {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
  vat: string | false;
  city: string | false;
  category_id: number[];
  child_ids: number[];
  parent_id: [number, string] | false;
  user_id: [number, string] | false;
  type: string | false;
  is_company: boolean;
  active: boolean;
  customer_rank: number;
}

export interface OdooProduct {
  id: number;
  name: string;
  description_sale: string | false;
  list_price: number;
  standard_price: number;
  uom_name: string;
  categ_id: [number, string];
  product_tag_ids: number[];
  active: boolean;
  sale_ok: boolean;
  image_128: string | false;
  default_code: string | false;
  product_variant_count?: number;
  attribute_line_ids?: number[];
  /**
   * Fecha ISO de la última escritura sobre el registro en Odoo
   * (cualquier campo). Útil como proxy para detectar costos
   * potencialmente desactualizados.
   */
  write_date?: string | false;
}

export interface OdooProductVariant {
  id: number;
  name: string;
  product_tmpl_id: [number, string];
  default_code: string | false;
  image_128: string | false;
  lst_price: number;
  standard_price: number;
  product_template_attribute_value_ids: number[];
  active: boolean;
  write_date?: string | false;
}

export interface OdooAttributeValue {
  id: number;
  name: string;
  attribute_id: [number, string];
  html_color: string | false;
  is_custom: boolean;
}

export interface OdooAttributeLine {
  id: number;
  attribute_id: [number, string];
  value_ids: number[];
  product_template_value_ids: number[];
}

export interface OdooTemplateAttributeValue {
  id: number;
  name: string;
  attribute_id: [number, string];
  product_attribute_value_id: [number, string];
  html_color: string | false;
  price_extra: number;
  ptav_active: boolean;
}

export interface OdooProductTag {
  id: number;
  name: string;
  color: number;
}

export interface OdooCategory {
  id: number;
  name: string;
  complete_name: string;
  parent_id: [number, string] | false;
}

export interface OdooPricelistItem {
  id: number;
  pricelist_id: [number, string] | false;
  applied_on: string;
  product_tmpl_id: [number, string] | false;
  product_id: [number, string] | false;
  categ_id: [number, string] | false;
  compute_price: string;
  fixed_price: number;
  percent_price: number;
  base: string;
  min_quantity: number;
}

export interface OdooSaleOrderLineInput {
  productTemplateId: number;
  productId?: number;
  name: string;
  quantity: number;
  priceUnit: number;
}

export interface OdooSaleOrderResult {
  id: number;
  name: string | null;
  state: string | null;
  existing: boolean;
}

export interface OdooSaleOrderSummary {
  id: number;
  name: string | null;
  state: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  currencyName: string | null;
}

function formatOdooDatetime(date: Date | string): string {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
  const seconds = String(parsed.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export async function createSaleOrderQuotation(
  session: OdooSession,
  params: {
    partnerId: number;
    clientReference: string;
    lines: OdooSaleOrderLineInput[];
    dateOrder?: string | null;
    invoicePartnerId?: number | null;
    shippingPartnerId?: number | null;
    pricelistId?: number | null;
    salespersonId?: number | null;
    origin?: string | null;
    note?: string | null;
  }
): Promise<OdooSaleOrderResult> {
  if (!params.lines.length && !params.note?.trim()) {
    throw new Error('No hay líneas para crear la cotización en Odoo.');
  }

  const existingOrders = await searchRead(
    'sale.order',
    [
      ['partner_id', '=', params.partnerId],
      ['client_order_ref', '=', params.clientReference],
    ],
    ['id', 'name', 'state'],
    { limit: 1, order: 'id desc', session }
  );

  if (existingOrders.length > 0) {
    const existingOrder = existingOrders[0];
    return {
      id: Number(existingOrder.id),
      name: typeof existingOrder.name === 'string' ? existingOrder.name : null,
      state: typeof existingOrder.state === 'string' ? existingOrder.state : null,
      existing: true,
    };
  }

  // Separar líneas con variante explícita vs las que necesitan lookup
  const linesWithVariant = params.lines.filter((l) => l.productId);
  const linesWithoutVariant = params.lines.filter((l) => !l.productId);

  const variantByTemplateId = new Map<number, number>();

  // Para líneas con variante explícita, mapear directamente
  for (const line of linesWithVariant) {
    variantByTemplateId.set(line.productTemplateId, line.productId!);
  }

  // Para líneas sin variante, buscar la variante por defecto del template
  if (linesWithoutVariant.length > 0) {
    const templateIds = Array.from(new Set(linesWithoutVariant.map((line) => line.productTemplateId)));
    const productVariants = await searchRead(
      'product.product',
      [['product_tmpl_id', 'in', templateIds]],
      ['id', 'product_tmpl_id'],
      { session }
    );

    for (const variant of productVariants) {
      if (!Array.isArray(variant.product_tmpl_id)) continue;
      const templateId = Number(variant.product_tmpl_id[0]);
      if (!variantByTemplateId.has(templateId)) {
        variantByTemplateId.set(templateId, Number(variant.id));
      }
    }

    const missingTemplateIds = templateIds.filter((templateId) => !variantByTemplateId.has(templateId));
    if (missingTemplateIds.length > 0) {
      throw new Error(`No se encontraron variantes Odoo para product.template: ${missingTemplateIds.join(', ')}`);
    }
  }

  const orderLineCommands = params.lines.map((line) => {
    const variantId = line.productId || variantByTemplateId.get(line.productTemplateId);
    if (!variantId) {
      throw new Error(`No se encontró product.product para el template ${line.productTemplateId}.`);
    }

    return [
      0,
      0,
      {
        product_id: variantId,
        product_template_id: line.productTemplateId,
        name: line.name,
        product_uom_qty: line.quantity,
        price_unit: line.priceUnit,
        customer_lead: 0,
      },
    ];
  });

  const orderValues: Record<string, unknown> = {
    partner_id: params.partnerId,
    partner_invoice_id: params.invoicePartnerId ?? params.partnerId,
    partner_shipping_id: params.shippingPartnerId ?? params.partnerId,
    client_order_ref: params.clientReference,
    origin: params.origin ?? params.clientReference,
    date_order: formatOdooDatetime(params.dateOrder ?? new Date()),
  };

  if (orderLineCommands.length > 0) {
    orderValues.order_line = orderLineCommands;
  }

  if (params.pricelistId) {
    orderValues.pricelist_id = params.pricelistId;
  }

  if (params.salespersonId) {
    orderValues.user_id = params.salespersonId;
  }

  if (params.note) {
    orderValues.note = params.note.replace(/\n/g, '<br/>');
  }

  const saleOrderId = await create('sale.order', orderValues, session);
  const createdOrders = await read('sale.order', [saleOrderId], ['id', 'name', 'state'], session);
  const createdOrder = createdOrders[0];

  return {
    id: saleOrderId,
    name: createdOrder && typeof createdOrder.name === 'string' ? createdOrder.name : null,
    state: createdOrder && typeof createdOrder.state === 'string' ? createdOrder.state : null,
    existing: false,
  };
}

export async function getSaleOrderSummary(
  session: OdooSession,
  saleOrderId: number
): Promise<OdooSaleOrderSummary | null> {
  const rows = await read(
    'sale.order',
    [saleOrderId],
    ['id', 'name', 'state', 'amount_untaxed', 'amount_tax', 'amount_total', 'currency_id'],
    session
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: typeof row.name === 'string' ? row.name : null,
    state: typeof row.state === 'string' ? row.state : null,
    amountUntaxed: Number(row.amount_untaxed ?? 0),
    amountTax: Number(row.amount_tax ?? 0),
    amountTotal: Number(row.amount_total ?? 0),
    currencyName: Array.isArray(row.currency_id) && typeof row.currency_id[1] === 'string'
      ? row.currency_id[1]
      : null,
  };
}

export async function getClientes(
  session: OdooSession,
  options: { limit?: number; offset?: number } = {}
): Promise<OdooPartner[]> {
  const result = await searchRead(
    'res.partner',
    [['active', '=', true]],
    ['id', 'name', 'email', 'phone', 'vat', 'city', 'category_id', 'child_ids', 'parent_id', 'user_id', 'type', 'is_company', 'active', 'customer_rank'],
    { limit: options.limit ?? 200, offset: options.offset ?? 0, order: 'name asc', session }
  );
  return result as unknown as OdooPartner[];
}

const PRODUCT_TEMPLATE_FIELDS = [
  'id', 'name', 'description_sale', 'list_price', 'standard_price', 'uom_name', 'categ_id',
  'product_tag_ids', 'active', 'sale_ok', 'image_128', 'default_code',
  'product_variant_count', 'attribute_line_ids', 'write_date',
];

export interface ProductVariantsResult {
  variants: OdooProductVariant[];
  attributes: {
    id: number;
    name: string;
    values: {
      id: number;
      ptavId: number;
      name: string;
      htmlColor: string | false;
      priceExtra: number;
    }[];
  }[];
}

export async function getProductVariants(
  session: OdooSession,
  templateId: number
): Promise<ProductVariantsResult> {
  // 1. Obtener las líneas de atributo del template
  const attrLines = await searchRead(
    'product.template.attribute.line',
    [['product_tmpl_id', '=', templateId]],
    ['id', 'attribute_id', 'value_ids', 'product_template_value_ids'],
    { session }
  ) as unknown as OdooAttributeLine[];

  // 2. Obtener los product.template.attribute.value (tienen precio extra y html_color)
  const allPtavIds = attrLines.flatMap((line) => line.product_template_value_ids || []);
  let ptavs: OdooTemplateAttributeValue[] = [];
  if (allPtavIds.length > 0) {
    ptavs = await read(
      'product.template.attribute.value',
      allPtavIds,
      ['id', 'name', 'attribute_id', 'product_attribute_value_id', 'html_color', 'price_extra', 'ptav_active'],
      session
    ) as unknown as OdooTemplateAttributeValue[];
  }

  // 3. Construir estructura de atributos
  const ptavMap = new Map(ptavs.filter((p) => p.ptav_active !== false).map((p) => [p.id, p]));
  const attributes = attrLines.map((line) => {
    const attrId = Array.isArray(line.attribute_id) ? line.attribute_id[0] : 0;
    const attrName = Array.isArray(line.attribute_id) ? line.attribute_id[1] : '';
    const values = (line.product_template_value_ids || [])
      .map((ptavId) => {
        const ptav = ptavMap.get(ptavId);
        if (!ptav) return null;
        return {
          id: Array.isArray(ptav.product_attribute_value_id) ? ptav.product_attribute_value_id[0] : ptav.id,
          ptavId: ptav.id,
          name: ptav.name,
          htmlColor: ptav.html_color,
          priceExtra: ptav.price_extra || 0,
        };
      })
      .filter(Boolean) as ProductVariantsResult['attributes'][number]['values'];

    return { id: attrId, name: attrName, values };
  }).filter((a) => a.values.length > 0);

  // 4. Obtener variantes (product.product)
  const variants = await searchRead(
    'product.product',
    [['product_tmpl_id', '=', templateId], ['active', '=', true]],
    ['id', 'name', 'product_tmpl_id', 'default_code', 'image_128', 'lst_price', 'standard_price', 'product_template_attribute_value_ids', 'active', 'write_date'],
    { order: 'name asc', session }
  ) as unknown as OdooProductVariant[];

  return { variants, attributes };
}

export interface TemplateCostInfo {
  /**
   * Costo efectivo del template. Prioridad:
   *   1. price_unit de la última operación de compra (factura > orden) entre
   *      las variantes activas del template.
   *   2. Fallback: max(standard_price) entre variantes con standard_price > 0.
   */
  costo_efectivo: number;
  /**
   * Fecha ISO asociada al costo_efectivo:
   *   - Si vino de una compra: fecha del documento (YYYY-MM-DD).
   *   - Si vino del fallback: write_date más reciente de las variantes.
   */
  fecha_costo_efectivo: string | null;
  /** Fuente del costo efectivo. */
  costo_source: 'invoice' | 'order' | 'standard_price';
  /** Costos de variantes considerados (sin duplicar, ordenados desc). Para debug. */
  costos_variantes: number[];
  /** true si la variante con costo máximo y la mínima difieren > 50% (señal de variante desactualizada). */
  variantes_divergentes: boolean;
  /** Número de variantes activas consideradas. */
  variantes_consideradas: number;
}

/**
 * Tope superior de templates a enriquecer en una sola llamada. Si se supera
 * este número, getTemplateCostInfoFromVariants retorna un Map vacío y el
 * caller cae al fallback (write_date del product.template). Esto protege a
 * Odoo de queries masivas sobre product.product que han llegado a tumbar la
 * conexión psycopg2.
 */
const MAX_ENRICH_TEMPLATES = 100;

/**
 * Tamaño de chunk para batchear el searchRead sobre product.product. Cada
 * chunk se ejecuta en serie para no abrir muchas sesiones concurrentes en
 * Odoo. Con chunk_size=25 y MAX_ENRICH_TEMPLATES=100 nunca pasamos de 4
 * round-trips por página.
 */
const ENRICH_CHUNK_SIZE = 25;

/**
 * Para un conjunto de product.template IDs, lee sus variantes activas
 * (product.product) y resuelve, por template:
 *
 *   - el costo efectivo: max(standard_price) de variantes con standard_price > 0.
 *     Convención: la variante con costo más alto refleja la última compra real.
 *     Las variantes con costo viejo suelen quedar más bajas por inflación.
 *   - la fecha efectiva: max(write_date) entre esas mismas variantes. Refleja
 *     cuándo se modificó realmente algo a nivel variante, sin contaminarse con
 *     barridos masivos sobre product.template (que actualizan write_date a
 *     todo el catálogo de golpe).
 *   - flag de divergencia: si max(standard_price) / min(standard_price) > 1.5
 *     entre variantes consideradas, marca variantes_divergentes=true para
 *     señalar que probablemente hay una variante con costo desactualizado.
 *
 * Si un template no tiene variantes con costo > 0, no aparece en el Map y el
 * caller debe usar el costo/write_date del template como fallback.
 *
 * Estrategia de carga (defensiva contra saturación de Odoo):
 *   1. Si templateIds.length > MAX_ENRICH_TEMPLATES, retornamos Map vacío sin
 *      consultar Odoo.
 *   2. Procesamos en chunks de ENRICH_CHUNK_SIZE en serie.
 *   3. Si un chunk falla (timeout, conexión cerrada), seguimos con los demás
 *      mediante allSettled — preferimos info parcial sobre tirar la página.
 */
export async function getTemplateCostInfoFromVariants(
  session: OdooSession,
  templateIds: number[]
): Promise<Map<number, TemplateCostInfo>> {
  const result = new Map<number, TemplateCostInfo>();
  if (!templateIds.length) return result;

  // Deduplicar para no enviar IDs repetidos a Odoo.
  const uniqueIds = Array.from(new Set(templateIds));

  // Cap duro: si hay demasiados templates, mejor caemos al fallback.
  if (uniqueIds.length > MAX_ENRICH_TEMPLATES) {
    console.warn(
      `[getTemplateCostInfoFromVariants] Skip enrich: ${uniqueIds.length} templates exceden el cap (${MAX_ENRICH_TEMPLATES}). Caer al fallback de write_date del template.`
    );
    return result;
  }

  // Trocear en chunks para no enviar dominios gigantes a Odoo.
  const chunks: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += ENRICH_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(i, i + ENRICH_CHUNK_SIZE));
  }

  type VariantRow = {
    id: number;
    product_tmpl_id: [number, string] | false;
    standard_price: number;
    write_date: string | false;
  };

  const variants: VariantRow[] = [];
  for (const chunk of chunks) {
    try {
      const rows = (await searchRead(
        'product.product',
        [
          ['product_tmpl_id', 'in', chunk],
          ['active', '=', true],
        ],
        ['id', 'product_tmpl_id', 'standard_price', 'write_date'],
        { session }
      )) as unknown as VariantRow[];
      variants.push(...rows);
    } catch (chunkErr) {
      // Toleramos fallos parciales: seguimos con los demás chunks. La info
      // que falte se llenará con el fallback en el caller.
      console.warn(
        `[getTemplateCostInfoFromVariants] Chunk falló (${chunk.length} ids):`,
        chunkErr instanceof Error ? chunkErr.message : chunkErr
      );
    }
  }

  // Para resolver el costo "real", consultamos en paralelo el historial de
  // compras de TODAS las variantes activas que encontramos. Esto reemplaza
  // el comportamiento histórico que tomaba max(standard_price) — el
  // standard_price es un promedio AVCO/FIFO que NO refleja el último precio
  // pagado al proveedor.
  const variantIds = variants.map((v) => v.id);
  let lastPurchaseByVariant: Map<number, LastPurchaseCost> = new Map();
  if (variantIds.length > 0) {
    try {
      lastPurchaseByVariant = await getLastPurchaseCostByVariants(session, variantIds, {
        // El cap original (100) es por templates. Como cada template puede
        // tener varias variantes, ampliamos a 1500 para cubrir páginas grandes
        // sin saltar al "skip enrich".
        maxVariants: MAX_ENRICH_TEMPLATES * 15,
      });
    } catch (err) {
      console.warn(
        '[getTemplateCostInfoFromVariants] No se pudo cargar historial de compras:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // Agrupar variantes por templateId conservando standard_price (fallback) y
  // su última compra (preferida).
  type VariantAggregate = {
    variantId: number;
    standardPrice: number;
    writeDate: string | null;
    purchase: LastPurchaseCost | null;
  };
  const byTemplate = new Map<number, VariantAggregate[]>();
  for (const v of variants) {
    const tmplId = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null;
    if (!tmplId) continue;
    const list = byTemplate.get(tmplId) ?? [];
    list.push({
      variantId: v.id,
      standardPrice: typeof v.standard_price === 'number' ? v.standard_price : 0,
      writeDate: typeof v.write_date === 'string' ? v.write_date : null,
      purchase: lastPurchaseByVariant.get(v.id) ?? null,
    });
    byTemplate.set(tmplId, list);
  }

  for (const [tmplId, list] of byTemplate.entries()) {
    if (list.length === 0) continue;

    // Estrategia A: si alguna variante tiene historial de compra, el costo
    // efectivo del template es el price_unit de la variante con la fecha de
    // compra MÁS RECIENTE. Refleja "qué tan actualizado está mi costo de
    // referencia para este producto".
    const conCompra = list.filter((v) => v.purchase !== null) as Array<
      VariantAggregate & { purchase: LastPurchaseCost }
    >;
    if (conCompra.length > 0) {
      conCompra.sort((a, b) => b.purchase.date.localeCompare(a.purchase.date));
      const pick = conCompra[0];
      const costos = conCompra.map((v) => v.purchase.price_unit);
      const maxCosto = Math.max(...costos);
      const minCosto = Math.min(...costos);
      const variantes_divergentes = costos.length > 1 && minCosto > 0 && maxCosto / minCosto > 1.5;
      const costosUnicos = Array.from(new Set(costos)).sort((a, b) => b - a);

      result.set(tmplId, {
        costo_efectivo: pick.purchase.price_unit,
        fecha_costo_efectivo: pick.purchase.date,
        costo_source: pick.purchase.source,
        costos_variantes: costosUnicos,
        variantes_divergentes,
        variantes_consideradas: conCompra.length,
      });
      continue;
    }

    // Estrategia B (fallback): sin historial de compras, usar el max
    // standard_price entre variantes con costo > 0 (comportamiento previo).
    const conCosto = list.filter((v) => v.standardPrice > 0);
    if (conCosto.length === 0) continue;

    const costos = conCosto.map((v) => v.standardPrice);
    const maxCosto = Math.max(...costos);
    const minCosto = Math.min(...costos);
    const variantes_divergentes = conCosto.length > 1 && minCosto > 0 && maxCosto / minCosto > 1.5;

    let fechaMax: string | null = null;
    for (const v of conCosto) {
      if (!v.writeDate) continue;
      if (!fechaMax || v.writeDate > fechaMax) {
        fechaMax = v.writeDate;
      }
    }

    const costosUnicos = Array.from(new Set(costos)).sort((a, b) => b - a);

    result.set(tmplId, {
      costo_efectivo: maxCosto,
      fecha_costo_efectivo: fechaMax,
      costo_source: 'standard_price',
      costos_variantes: costosUnicos,
      variantes_divergentes,
      variantes_consideradas: conCosto.length,
    });
  }

  return result;
}

/**
 * Costo "real" derivado de la última compra registrada para una variante.
 *
 * Una variante puede tener varias fuentes de costo:
 *   - `standard_price` (campo "Costo" en Odoo): promedio AVCO/FIFO calculado.
 *     NO refleja el último precio pagado; va suavizando con cada recepción.
 *   - Última `purchase.order.line` confirmada (precio negociado).
 *   - Última `account.move.line` posted de factura de proveedor (precio
 *     realmente facturado, puede incluir ajustes).
 *
 * Para decisiones comerciales (markup, descuentos, alertas) es más fiel el
 * precio real de la última compra. Esta función consulta ambas fuentes y se
 * queda con la más reciente por variante.
 */
export interface LastPurchaseCost {
  /** ID de la variante (product.product.id). */
  variant_id: number;
  /** Precio unitario de la última compra (sin IVA, en moneda de la operación). */
  price_unit: number;
  /** Fecha de la operación (YYYY-MM-DD). */
  date: string;
  /** Fuente del dato. */
  source: 'invoice' | 'order';
  /** Proveedor (res.partner). */
  partner_id: number | null;
  partner_name: string | null;
  /** Moneda de la operación (puede no ser COP en compras importadas). */
  currency: string | null;
  /** Cantidad de la línea, por si el usuario quiere validar contexto. */
  quantity: number;
  /** Referencia humana del documento (ej: FACTU/2026/05/0103 o P28047). */
  document_ref: string | null;
}

/**
 * Para un conjunto de IDs de variante (product.product), consulta en paralelo:
 *   - account.move.line (facturas de proveedor posted)
 *   - purchase.order.line (órdenes de compra confirmadas: state in purchase|done)
 *
 * y devuelve, por variante, el evento con fecha más reciente.
 *
 * Defensivo igual que getTemplateCostInfoFromVariants:
 *   - Si variantIds excede MAX_ENRICH_TEMPLATES, devuelve Map vacío.
 *   - Procesa en chunks de ENRICH_CHUNK_SIZE en serie.
 *   - Filtra por fecha (últimos N años) para acotar volumen.
 *   - Tolera fallos parciales.
 */
export async function getLastPurchaseCostByVariants(
  session: OdooSession,
  variantIds: number[],
  options: { lookbackYears?: number; maxVariants?: number } = {}
): Promise<Map<number, LastPurchaseCost>> {
  const result = new Map<number, LastPurchaseCost>();
  if (!variantIds.length) return result;

  const uniqueIds = Array.from(new Set(variantIds));
  // Por defecto reutilizamos MAX_ENRICH_TEMPLATES (100), pero el caller puede
  // ampliarlo cuando ya viene acotado por número de templates (ej: 100
  // templates × 10 variantes = 1000 variantes posibles).
  const maxVariants = options.maxVariants ?? MAX_ENRICH_TEMPLATES;
  if (uniqueIds.length > maxVariants) {
    console.warn(
      `[getLastPurchaseCostByVariants] Skip enrich: ${uniqueIds.length} variantes exceden el cap (${maxVariants}).`
    );
    return result;
  }

  // Lookback configurable. Por defecto 3 años — suficiente para detectar
  // productos sin movimiento reciente sin traer histórico antiguo.
  const lookbackYears = options.lookbackYears ?? 3;
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - lookbackYears);
  const cutoff = cutoffDate.toISOString().slice(0, 10);

  const chunks: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += ENRICH_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(i, i + ENRICH_CHUNK_SIZE));
  }

  type InvoiceLineRow = {
    id: number;
    product_id: [number, string] | false;
    price_unit: number;
    date: string | false;
    move_id: [number, string] | false;
    partner_id: [number, string] | false;
    currency_id: [number, string] | false;
    quantity: number;
  };

  type OrderLineRow = {
    id: number;
    product_id: [number, string] | false;
    price_unit: number;
    date_order: string | false;
    order_id: [number, string] | false;
    partner_id: [number, string] | false;
    currency_id: [number, string] | false;
    product_qty: number;
    state: string;
  };

  const invoiceByVariant = new Map<number, InvoiceLineRow>();
  const orderByVariant = new Map<number, OrderLineRow>();

  for (const chunk of chunks) {
    // Facturas de proveedor posted.
    try {
      const rows = (await searchRead(
        'account.move.line',
        [
          ['product_id', 'in', chunk],
          ['parent_state', '=', 'posted'],
          ['move_id.move_type', '=', 'in_invoice'],
          ['price_unit', '>', 0],
          ['date', '>=', cutoff],
        ],
        ['id', 'product_id', 'price_unit', 'date', 'move_id', 'partner_id', 'currency_id', 'quantity'],
        { order: 'date desc, id desc', session }
      )) as unknown as InvoiceLineRow[];
      for (const row of rows) {
        const pid = Array.isArray(row.product_id) ? row.product_id[0] : null;
        if (!pid) continue;
        // searchRead viene ordenado desc → la primera ocurrencia es la más reciente.
        if (!invoiceByVariant.has(pid)) {
          invoiceByVariant.set(pid, row);
        }
      }
    } catch (err) {
      console.warn(
        `[getLastPurchaseCostByVariants] invoice chunk falló (${chunk.length} ids):`,
        err instanceof Error ? err.message : err
      );
    }

    // Órdenes de compra confirmadas.
    try {
      const rows = (await searchRead(
        'purchase.order.line',
        [
          ['product_id', 'in', chunk],
          ['state', 'in', ['purchase', 'done']],
          ['price_unit', '>', 0],
          ['date_order', '>=', cutoff],
        ],
        ['id', 'product_id', 'price_unit', 'date_order', 'order_id', 'partner_id', 'currency_id', 'product_qty', 'state'],
        { order: 'date_order desc, id desc', session }
      )) as unknown as OrderLineRow[];
      for (const row of rows) {
        const pid = Array.isArray(row.product_id) ? row.product_id[0] : null;
        if (!pid) continue;
        if (!orderByVariant.has(pid)) {
          orderByVariant.set(pid, row);
        }
      }
    } catch (err) {
      console.warn(
        `[getLastPurchaseCostByVariants] order chunk falló (${chunk.length} ids):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Resolver "más reciente" por variante.
  for (const pid of uniqueIds) {
    const inv = invoiceByVariant.get(pid);
    const ord = orderByVariant.get(pid);

    // Normalizar fechas a YYYY-MM-DD para comparar lexicográficamente.
    const invDate = inv && typeof inv.date === 'string' ? inv.date.slice(0, 10) : null;
    const ordDate = ord && typeof ord.date_order === 'string' ? ord.date_order.slice(0, 10) : null;

    let pick:
      | {
          source: 'invoice' | 'order';
          price: number;
          date: string;
          partner: [number, string] | false;
          currency: [number, string] | false;
          quantity: number;
          docRef: [number, string] | false;
        }
      | null = null;

    if (invDate && ordDate) {
      pick = invDate >= ordDate
        ? {
            source: 'invoice',
            price: inv!.price_unit,
            date: invDate,
            partner: inv!.partner_id,
            currency: inv!.currency_id,
            quantity: inv!.quantity,
            docRef: inv!.move_id,
          }
        : {
            source: 'order',
            price: ord!.price_unit,
            date: ordDate,
            partner: ord!.partner_id,
            currency: ord!.currency_id,
            quantity: ord!.product_qty,
            docRef: ord!.order_id,
          };
    } else if (invDate) {
      pick = {
        source: 'invoice',
        price: inv!.price_unit,
        date: invDate,
        partner: inv!.partner_id,
        currency: inv!.currency_id,
        quantity: inv!.quantity,
        docRef: inv!.move_id,
      };
    } else if (ordDate) {
      pick = {
        source: 'order',
        price: ord!.price_unit,
        date: ordDate,
        partner: ord!.partner_id,
        currency: ord!.currency_id,
        quantity: ord!.product_qty,
        docRef: ord!.order_id,
      };
    }

    if (pick) {
      result.set(pid, {
        variant_id: pid,
        price_unit: pick.price,
        date: pick.date,
        source: pick.source,
        partner_id: Array.isArray(pick.partner) ? pick.partner[0] : null,
        partner_name: Array.isArray(pick.partner) ? pick.partner[1] : null,
        currency: Array.isArray(pick.currency) ? pick.currency[1] : null,
        quantity: pick.quantity,
        document_ref: Array.isArray(pick.docRef) ? pick.docRef[1] : null,
      });
    }
  }

  return result;
}

export async function getProductos(
  session: OdooSession,
  options: { tagIds?: number[]; categIds?: number[]; limit?: number; offset?: number; search?: string } = {}
): Promise<OdooProduct[]> {
  const domain: unknown[] = [['sale_ok', '=', true], ['active', '=', true]];
  if (options.tagIds && options.tagIds.length > 0) {
    domain.push(['product_tag_ids', 'in', options.tagIds]);
  }
  if (options.categIds && options.categIds.length > 0) {
    domain.push(['categ_id', 'in', options.categIds]);
  }
  if (options.search && options.search.trim().length >= 2) {
    const term = options.search.trim();
    domain.push('|', ['name', 'ilike', term], ['default_code', 'ilike', term]);
  }

  const result = await searchRead(
    'product.template',
    domain,
    PRODUCT_TEMPLATE_FIELDS,
    { limit: options.limit ?? 200, offset: options.offset ?? 0, order: 'name asc', session }
  );
  return result as unknown as OdooProduct[];
}

function applyPricelistRule(basePrice: number, rule: OdooPricelistItem | null | undefined): number {
  if (!rule) return basePrice;
  if (rule.compute_price === 'fixed' && typeof rule.fixed_price === 'number') {
    return rule.fixed_price;
  }
  if (rule.compute_price === 'percentage' && typeof rule.percent_price === 'number') {
    return Math.max(0, basePrice - (basePrice * rule.percent_price) / 100);
  }
  return basePrice;
}

function sortAndSliceProductos(
  productos: OdooProduct[],
  options: { limit?: number; offset?: number } = {}
): OdooProduct[] {
  const ordered = [...productos].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const offset = options.offset ?? 0;
  const limit = options.limit;
  if (limit === undefined) {
    return ordered.slice(offset);
  }
  return ordered.slice(offset, offset + limit);
}

export async function getProductosByPricelist(
  session: OdooSession,
  pricelistId: number,
  options: { limit?: number; offset?: number; categIds?: number[]; search?: string } = {}
): Promise<OdooProduct[]> {
  const pricelistItems = await searchRead(
    'product.pricelist.item',
    [['pricelist_id', '=', pricelistId]],
    ['id', 'pricelist_id', 'applied_on', 'product_tmpl_id', 'product_id', 'categ_id', 'compute_price', 'fixed_price', 'percent_price', 'base', 'min_quantity'],
    { order: 'applied_on asc,id asc', session }
  ) as unknown as OdooPricelistItem[];

  if (!pricelistItems.length) {
    return [];
  }

  const explicitTemplateIds = new Set<number>();
  const variantIds = new Set<number>();
  const categoryIds = new Set<number>();
  const explicitRules = new Map<number, OdooPricelistItem>();
  const categoryRules = new Map<number, OdooPricelistItem>();
  let globalRule: OdooPricelistItem | null = null;

  for (const item of pricelistItems) {
    if (item.applied_on === '3_global') {
      globalRule = item;
      continue;
    }

    if (item.applied_on === '2_product_category' && Array.isArray(item.categ_id)) {
      const categoryId = item.categ_id[0];
      categoryIds.add(categoryId);
      categoryRules.set(categoryId, item);
      continue;
    }

    if (item.applied_on === '1_product' && Array.isArray(item.product_tmpl_id)) {
      const templateId = item.product_tmpl_id[0];
      explicitTemplateIds.add(templateId);
      explicitRules.set(templateId, item);
      continue;
    }

    if (item.applied_on === '0_product_variant' && Array.isArray(item.product_id)) {
      variantIds.add(item.product_id[0]);
    }
  }

  if (variantIds.size > 0) {
    const variantRows = await read(
      'product.product',
      Array.from(variantIds),
      ['id', 'product_tmpl_id'],
      session
    );

    const variantItemMap = new Map(
      pricelistItems
        .filter((item) => item.applied_on === '0_product_variant' && Array.isArray(item.product_id))
        .map((item) => [Array.isArray(item.product_id) ? item.product_id[0] : 0, item])
    );

    for (const variant of variantRows) {
      if (!Array.isArray(variant.product_tmpl_id)) continue;
      const templateId = variant.product_tmpl_id[0] as number;
      explicitTemplateIds.add(templateId);
      const variantId = typeof variant.id === 'number' ? variant.id : 0;
      const variantRule = variantItemMap.get(variantId);
      if (variantRule) {
        explicitRules.set(templateId, variantRule);
      }
    }
  }

  let productos: OdooProduct[] = [];

  if (globalRule) {
    productos = await getProductos(session, {
      categIds: options.categIds,
      limit: options.limit,
      offset: options.offset,
      search: options.search,
    });
  } else {
    const chunks: OdooProduct[][] = [];

    if (explicitTemplateIds.size > 0) {
      const explicitDomain: unknown[] = [
        ['sale_ok', '=', true],
        ['active', '=', true],
        ['id', 'in', Array.from(explicitTemplateIds)],
      ];
      if (options.categIds && options.categIds.length > 0) {
        explicitDomain.push(['categ_id', 'in', options.categIds]);
      }
      if (options.search && options.search.trim().length >= 2) {
        const term = options.search.trim();
        explicitDomain.push('|', ['name', 'ilike', term], ['default_code', 'ilike', term]);
      }

      const explicitProducts = await searchRead(
        'product.template',
        explicitDomain,
        PRODUCT_TEMPLATE_FIELDS,
        { order: 'name asc', session }
      );
      chunks.push(explicitProducts as unknown as OdooProduct[]);
    }

    if (categoryIds.size > 0) {
      const allowedCategoryIds =
        options.categIds && options.categIds.length > 0
          ? Array.from(categoryIds).filter((categoryId) => options.categIds?.includes(categoryId))
          : Array.from(categoryIds);

      if (allowedCategoryIds.length > 0) {
        const catDomain: unknown[] = [['sale_ok', '=', true], ['active', '=', true], ['categ_id', 'in', allowedCategoryIds]];
        if (options.search && options.search.trim().length >= 2) {
          const term = options.search.trim();
          catDomain.push('|', ['name', 'ilike', term], ['default_code', 'ilike', term]);
        }
        const categoryProducts = await searchRead(
          'product.template',
          catDomain,
          PRODUCT_TEMPLATE_FIELDS,
          { order: 'name asc', session }
        );
        chunks.push(categoryProducts as unknown as OdooProduct[]);
      }
    }

    const productosMap = new Map<number, OdooProduct>();
    for (const chunk of chunks) {
      for (const producto of chunk) {
        productosMap.set(producto.id, producto);
      }
    }
    productos = sortAndSliceProductos(Array.from(productosMap.values()), options);
  }

  return productos.map((producto) => {
    const categoryId = Array.isArray(producto.categ_id) ? producto.categ_id[0] : null;
    const appliedRule =
      explicitRules.get(producto.id) ||
      (categoryId ? categoryRules.get(categoryId) : undefined) ||
      globalRule;

    if (!appliedRule) {
      return producto;
    }

    return {
      ...producto,
      list_price: applyPricelistRule(producto.list_price, appliedRule),
    };
  });
}

export async function getEtiquetasProducto(
  session: OdooSession
): Promise<OdooProductTag[]> {
  // En Odoo 18 el modelo es product.tag (product_tag_ids en product.template)
  const result = await searchRead(
    'product.tag',
    [],
    ['id', 'name', 'color'],
    { order: 'name asc', session }
  );
  return result as unknown as OdooProductTag[];
}

export async function getCategoriasProducto(
  session: OdooSession
): Promise<OdooCategory[]> {
  const result = await searchRead(
    'product.category',
    [],
    ['id', 'name', 'complete_name', 'parent_id'],
    { order: 'complete_name asc', session }
  );
  return result as unknown as OdooCategory[];
}

export async function getPricelists(
  session: OdooSession
): Promise<{ id: number; name: string; currency_id: [number, string] | null }[]> {
  const result = await searchRead(
    'product.pricelist',
    [],
    ['id', 'name', 'currency_id'],
    { order: 'name asc', session }
  );
  return result as unknown as { id: number; name: string; currency_id: [number, string] | null }[];
}

export async function getEtiquetasCliente(
  session: OdooSession
): Promise<{ id: number; name: string; color: number }[]> {
  const result = await searchRead(
    'res.partner.category',
    [],
    ['id', 'name', 'color'],
    { order: 'name asc', session }
  );
  return result as unknown as { id: number; name: string; color: number }[];
}

// =============================================
// Test de conexión completo
// =============================================

export async function testConnectionWithConfig(cfg: OdooConfig): Promise<{
  success: boolean;
  version?: unknown;
  uid?: number;
  partners_count?: number;
  products_count?: number;
  sample_partners?: Record<string, unknown>[];
  sample_products?: Record<string, unknown>[];
  sale_orders_count?: number;
  sample_orders?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    let version: unknown;
    try {
      version = await getServerVersion(cfg);
    } catch {
      version = { server_version: 'desconocida' };
    }

    const session = await authenticate(cfg);

    const [partners_count, products_count, sale_orders_count] = await Promise.all([
      searchCount('res.partner', [['active', '=', true]], session),
      searchCount('product.template', [['sale_ok', '=', true]], session),
      searchCount('sale.order', [], session),
    ]);

    const [sample_partners, sample_products, sample_orders] = await Promise.all([
      searchRead('res.partner', [['active', '=', true]], ['id', 'name', 'email', 'vat', 'city', 'customer_rank'], { limit: 5, order: 'name asc', session }),
      searchRead('product.template', [['sale_ok', '=', true]], ['id', 'name', 'list_price', 'categ_id', 'product_tag_ids'], { limit: 5, order: 'name asc', session }),
      searchRead('sale.order', [], ['id', 'name', 'partner_id', 'date_order', 'state', 'amount_total'], { limit: 5, order: 'date_order desc', session }),
    ]);

    return {
      success: true,
      version,
      uid: session.uid,
      partners_count,
      products_count,
      sample_partners,
      sample_products,
      sale_orders_count,
      sample_orders,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testConnection(): Promise<ReturnType<typeof testConnectionWithConfig>> {
  return testConnectionWithConfig(getConfig());
}
