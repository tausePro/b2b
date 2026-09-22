export const EMPAQUES_ADS_HOST = 'empaques.imprima.com.co';

export function isEmpaquesAdsHost(hostname: string): boolean {
  return [EMPAQUES_ADS_HOST, 'empaques.localhost'].includes(hostname.toLowerCase());
}

export function isEmpaquesAdsSurface(hostname: string, pathname: string): boolean {
  if (!isEmpaquesAdsHost(hostname)) return false;
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  return ['/', '/empaques', '/personalizados', '/empaques/personalizados', '/contacto', '/nosotros', '/faq', '/privacidad', '/terminos'].includes(path)
    || /^\/(?:empaques\/)?[1-9]\d*$/.test(path);
}

export function canUseEmpaquesAttribution(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isEmpaquesAdsHost(window.location.hostname)) return true;
  return isEmpaquesAdsSurface(window.location.hostname, window.location.pathname);
}
