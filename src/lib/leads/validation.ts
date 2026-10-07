/**
 * Validación compartida de los datos de contacto que dejan los visitantes en
 * los formularios públicos. Se usa en el servidor (autoritativo) y en los
 * formularios para avisar antes de enviar. No inventa ni completa datos: solo
 * normaliza espacios, mayúsculas del correo y formato del teléfono.
 */

export const LEAD_LIMITS = { nombre: 120, empresa: 160, email: 254, telefono: 30, mensaje: 2000, fuente: 80 } as const;
export const LEAD_HONEYPOT_FIELD = 'sitio_web';
export const LEAD_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export class LeadValidationError extends Error {
  constructor(message: string, readonly field: 'nombre' | 'empresa' | 'email' | 'telefono' | 'mensaje' | 'contacto' | 'general') {
    super(message);
  }
}

export type LeadContactInput = { nombre: unknown; empresa?: unknown; email?: unknown; telefono?: unknown; mensaje?: unknown };
export type ValidLeadContact = { nombre: string; empresa: string | null; email: string | null; telefono: string | null; mensaje: string | null };

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}$/;
const URL_LIKE = '(?:https?:\\/\\/|www\\.)\\S+|\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|co|ru|xyz|info|biz|io|top|online|site|shop)\\b\\S*';
const countLinks = (value: string) => value.match(new RegExp(URL_LIKE, 'gi'))?.length ?? 0;

function clean(raw: unknown, field: keyof typeof LEAD_LIMITS, label: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new LeadValidationError(`${label} no es válido.`, field === 'fuente' ? 'general' : field);
  const value = Array.from(raw.normalize('NFC'))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return field === 'mensaje' ? code >= 32 || code === 10 : code >= 32;
    })
    .join('')
    .replace(field === 'mensaje' ? /[ \t]+/g : /\s+/g, ' ')
    .trim();
  if (!value) return null;
  if (value.length > LEAD_LIMITS[field]) {
    throw new LeadValidationError(`${label} supera los ${LEAD_LIMITS[field]} caracteres permitidos.`, field === 'fuente' ? 'general' : field);
  }
  return value;
}

export function validateLeadName(raw: unknown): string {
  const nombre = clean(raw, 'nombre', 'El nombre');
  if (!nombre) throw new LeadValidationError('Escribe tu nombre.', 'nombre');
  const letters = nombre.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2 || !/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u.test(nombre) || /^(.)\1+$/u.test(nombre.replace(/\s/g, ''))) {
    throw new LeadValidationError('Escribe tu nombre real, solo con letras.', 'nombre');
  }
  return nombre;
}

export function normalizeLeadEmail(raw: unknown): string | null {
  const value = clean(raw, 'email', 'El correo');
  if (!value) return null;
  const email = value.toLowerCase();
  const [local] = email.split('@');
  if (!EMAIL.test(email) || local.length > 64 || local.startsWith('.') || local.endsWith('.') || email.includes('..')) {
    throw new LeadValidationError('Revisa el correo: no tiene un formato válido.', 'email');
  }
  return email;
}

/**
 * Colombia: celular de 10 dígitos que inicia en 3 o fijo nacional 60X + 7
 * dígitos (con o sin indicativo 57). Otros países: con "+" e indicativo,
 * 8 a 15 dígitos (E.164). Devuelve el número en formato E.164.
 */
export function normalizeLeadPhone(raw: unknown): string | null {
  const value = clean(raw, 'telefono', 'El teléfono');
  if (!value) return null;
  if (!/^\+?[\d\s().-]+$/.test(value)) throw new LeadValidationError('Revisa el teléfono: usa solo números.', 'telefono');
  const international = value.startsWith('+');
  let digits = value.replace(/\D/g, '');
  if (international && !digits.startsWith('57')) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0') || /^(\d)\1+$/.test(digits)) {
      throw new LeadValidationError('Revisa el teléfono: incluye el indicativo del país y el número completo.', 'telefono');
    }
    return `+${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2);
  const valid = /^3\d{9}$/.test(digits) || /^60[1-8]\d{7}$/.test(digits);
  if (!valid || /^(\d)\1+$/.test(digits.slice(1)) || /^3(\d)\1{8}$/.test(digits)) {
    throw new LeadValidationError('Revisa el teléfono: escribe un celular de 10 dígitos (ej. 300 123 4567) o un fijo con indicativo 60X.', 'telefono');
  }
  return `+57${digits}`;
}

export function validateLeadContact(input: LeadContactInput): ValidLeadContact {
  const nombre = validateLeadName(input.nombre);
  const empresa = clean(input.empresa, 'empresa', 'La empresa');
  const email = normalizeLeadEmail(input.email);
  const telefono = normalizeLeadPhone(input.telefono);
  const mensaje = clean(input.mensaje, 'mensaje', 'El mensaje');
  if (!email && !telefono) throw new LeadValidationError('Déjanos un correo o un teléfono para poder contactarte.', 'contacto');
  if (empresa && (countLinks(empresa) > 0 || empresa.includes('@'))) {
    throw new LeadValidationError('Escribe solo el nombre de la empresa, sin enlaces ni correos.', 'empresa');
  }
  if (mensaje && countLinks(mensaje) > 1) {
    throw new LeadValidationError('El mensaje no puede incluir varios enlaces.', 'mensaje');
  }
  return { nombre, empresa, email, telefono, mensaje };
}

export function normalizeLeadSource(raw: unknown): string {
  return typeof raw === 'string' && /^[a-z0-9_]{1,80}$/.test(raw) ? raw : 'landing';
}

export function isLeadHoneypotFilled(body: Record<string, unknown>): boolean {
  const value = body[LEAD_HONEYPOT_FIELD];
  return typeof value === 'string' && value.trim().length > 0;
}
