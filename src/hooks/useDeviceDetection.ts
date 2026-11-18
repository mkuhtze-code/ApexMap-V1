import { useState, useEffect } from 'react';

export interface DeviceDetectionState {
  isMobile: boolean;
  isTablet: boolean;
  isTouchDevice: boolean;
  isStandalone: boolean;
  viewportWidth: number;
  viewportHeight: number;
  isLandscape: boolean;
}

export function useDeviceDetection(): DeviceDetectionState {
  const getSnapshot = (): DeviceDetectionState => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isTouchDevice: false,
        isStandalone: false,
        viewportWidth: 1280,
        viewportHeight: 800,
        isLandscape: true
      };
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || coarsePointer;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const ua = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/.test(ua);

    // Mobile screen detected if width < 768px OR phone UA with narrow viewport (< 900px)
    const isMobile = w < 768 || (isMobileUA && w < 900);
    const isTablet = !isMobile && (w < 1024 || (hasTouch && w <= 1180));

    return {
      isMobile,
      isTablet,
      isTouchDevice: hasTouch,
      isStandalone,
      viewportWidth: w,
      viewportHeight: h,
      isLandscape: w > h
    };
  };

  const [state, setState] = useState<DeviceDetectionState>(getSnapshot);

  useEffect(() => {
    const update = () => setState(getSnapshot());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);

  return state;
}
