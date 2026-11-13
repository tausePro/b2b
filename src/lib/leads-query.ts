export const LEAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ADMIN_LEADS = 500;

export function parseAdminLeadQuery(params: URLSearchParams) {
  const id = params.get('id');
  if (params.has('id') && (!id || id.length !== 36 || !LEAD_ID_PATTERN.test(id))) throw new Error('El identificador del lead no es válido.');
  const requestedLimit = Number(params.get('limit') ?? '50');
  const requestedOffset = Number(params.get('offset') ?? '0');
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || !Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    throw new Error('La paginación no es válida.');
  }
  // `desde`: leads creados desde esa fecha (ISO). Lo usa el tablero de seguimiento (últimos 60 días).
  const since = params.get('desde');
  if (since !== null && (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(since) || Number.isNaN(Date.parse(since)))) {
    throw new Error('La fecha inicial no es válida.');
  }
  return {
    leadId: id?.toLowerCase() ?? null,
    limit: id ? 1 : Math.min(requestedLimit, MAX_ADMIN_LEADS),
    offset: id ? 0 : requestedOffset,
    since: id ? null : since,
  };
}
