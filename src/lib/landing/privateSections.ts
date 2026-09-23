export const INTERNAL_LEAD_NOTIFICATION_SECTION = 'config_leads_notificaciones';
export const PUBLIC_LANDING_FIELDS = 'id, titulo, subtitulo, contenido, imagen_url, orden, activo, updated_at';

export function isInternalLandingSection(id: unknown): boolean {
  return id === INTERNAL_LEAD_NOTIFICATION_SECTION;
}
