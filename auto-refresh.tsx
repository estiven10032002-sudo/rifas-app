'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Vuelve a pedir los datos cada cierto tiempo para que el tablero público se mantenga al día. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
