'use client';

import { useEffect } from 'react';

/** Manifest e íconos de la PWA solo en el portal (login, dashboard y admin); React los ubica en <head>. */
export default function PwaHead() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return (
    <>
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png" />
      <meta name="theme-color" content="#9CBB06" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Imprima" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </>
  );
}
