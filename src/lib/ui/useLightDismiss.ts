'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Alternativa a `<dialog closedby="any">` donde el navegador no lo soporta:
 * cierra el diálogo si se presiona y se suelta fuera del cuadro (no al arrastrar una selección).
 */
export function useLightDismiss(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;
    const outside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let pressedOutside = false;
    const onDown = (event: PointerEvent) => { pressedOutside = outside(event); };
    const onUp = (event: PointerEvent) => { if (pressedOutside && outside(event)) dialog.close(); };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [ref]);
}
