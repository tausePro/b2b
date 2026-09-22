'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isEmpaquesAdsSurface } from '@/lib/analytics/adsScope';
import {
  GOOGLE_ADS_SCRIPT_URL, activateEmpaquesGoogleAds, prepareEmpaquesGoogleAds, suspendEmpaquesGoogleAds,
} from '@/lib/analytics/googleAds';
import { captureLeadAttributionFromUrl } from '@/lib/analytics/leadAttribution';

export default function EmpaquesAds() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isEmpaquesAdsSurface(window.location.hostname, window.location.pathname)) {
      suspendEmpaquesGoogleAds();
      return;
    }
    captureLeadAttributionFromUrl();
    if (!prepareEmpaquesGoogleAds()) return;
    const existing = document.getElementById('empaques-google-ads');
    if (existing) {
      if (existing.dataset.loaded === 'true') activateEmpaquesGoogleAds();
      return;
    }
    const script = document.createElement('script');
    script.id = 'empaques-google-ads';
    script.async = true;
    script.src = GOOGLE_ADS_SCRIPT_URL;
    script.onload = () => { script.dataset.loaded = 'true'; activateEmpaquesGoogleAds(); };
    script.onerror = suspendEmpaquesGoogleAds;
    document.head.appendChild(script);
  }, [pathname]);

  return null;
}
