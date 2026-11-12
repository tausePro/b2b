const moneyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const millionsFormatter = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const monthLongFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShortFormatter = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });

export const formatMoney = (value: number) => moneyFormatter.format(value);

/** "$ 231,4 M" para millones; valores menores con formato completo. */
export function formatMoneyShort(value: number): string {
  return Math.abs(value) >= 1_000_000 ? `$ ${millionsFormatter.format(value / 1_000_000)} M` : moneyFormatter.format(value);
}

export const formatPercent = (value: number | null) => (value === null ? '—' : `${percentFormatter.format(value)}%`);
export const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${percentFormatter.format(value)}%`;
export const formatDateTimeBogota = (iso: string) => dateTimeFormatter.format(new Date(iso));
export const formatMonthLong = (month: string) => monthLongFormatter.format(new Date(`${month}-01T00:00:00Z`));

/** "oct" si es del año de referencia; "nov 25" si es de otro año. */
export function formatMonthShort(month: string, referenceYear?: string): string {
  const label = monthShortFormatter.format(new Date(`${month}-01T00:00:00Z`)).replace('.', '');
  return referenceYear && month.slice(0, 4) !== referenceYear ? `${label} ${month.slice(2, 4)}` : label;
}

/** Nombres de Odoo en mayúsculas ("GLORIA PATRICIA GOMEZ") a formato legible ("Gloria Patricia Gomez"). */
export function toDisplayName(value: string): string {
  if (value !== value.toLocaleUpperCase('es-CO')) return value;
  return value.toLocaleLowerCase('es-CO').replace(/(^|[\s(-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase('es-CO')}`);
}

/** Nombre corto de persona: primer nombre y primer apellido ("Gloria Patricia Gomez Moncada" → "Gloria Gomez"). */
export function shortPersonName(value: string): string {
  const words = toDisplayName(value).split(/\s+/).filter(Boolean);
  if (words.length >= 4) return `${words[0]} ${words[2]}`;
  return words.slice(0, 2).join(' ');
}
