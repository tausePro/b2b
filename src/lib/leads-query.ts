export const LEAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAdminLeadQuery(params: URLSearchParams) {
  const id = params.get('id');
  if (params.has('id') && (!id || id.length !== 36 || !LEAD_ID_PATTERN.test(id))) throw new Error('El identificador del lead no es válido.');
  const requestedLimit = Number(params.get('limit') ?? '50');
  const requestedOffset = Number(params.get('offset') ?? '0');
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || !Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    throw new Error('La paginación no es válida.');
  }
  return {
    leadId: id?.toLowerCase() ?? null,
    limit: id ? 1 : Math.min(requestedLimit, 100),
    offset: id ? 0 : requestedOffset,
  };
}
