import { useCallback, useEffect, useState } from 'react';

export type DeviceExperienceOverride = 'auto' | 'mobile' | 'laptop';
export type DetectedDeviceKind = 'phone' | 'tablet' | 'laptop';
export type ActiveDeviceMode = 'mobile' | 'laptop';

export interface DeviceExperienceProfile {
  override: DeviceExperienceOverride;
  detectedKind: DetectedDeviceKind;
  activeMode: ActiveDeviceMode;
  isMobileExperience: boolean;
  isLaptopExperience: boolean;
  isPortrait: boolean;
  hasTouchInput: boolean;
  viewportWidth: number;
  viewportHeight: number;
  label: string;
}

const DEVICE_OVERRIDE_STORAGE_KEY = 'aurelia_device_experience_override_v1';
const DEVICE_CHANGE_EVENT = 'aurelia-device-experience-change';

export function loadDeviceExperienceOverride(): DeviceExperienceOverride {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(DEVICE_OVERRIDE_STORAGE_KEY);
    if (raw === 'mobile' || raw === 'laptop' || raw === 'auto') {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'auto';
}

export function saveDeviceExperienceOverride(next: DeviceExperienceOverride): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEVICE_OVERRIDE_STORAGE_KEY, next);
  } catch {
    // Ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(DEVICE_CHANGE_EVENT));
}

export function detectHardwareDeviceKind(): {
  kind: DetectedDeviceKind;
  hasTouch: boolean;
} {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { kind: 'laptop', hasTouch: false };
  }

  const ua = navigator.userAgent || '';
  const uaDataMobile = Boolean(
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile,
  );

  const isPhoneUa = /Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone|Mobile Safari/i.test(
    ua,
  );
  const isIpadOs =
    /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  const isTabletUa =
    isIpadOs ||
    /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));

  let coarsePointer = false;
  let anyCoarsePointer = false;
  let finePointer = false;
  let hoverCapable = false;

  try {
    coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    anyCoarsePointer = window.matchMedia('(any-pointer: coarse)').matches;
    finePointer = window.matchMedia('(pointer: fine)').matches;
    hoverCapable = window.matchMedia('(hover: hover)').matches;
  } catch {
    // Ignore matchMedia errors
  }

  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const hasTouch =
    coarsePointer ||
    anyCoarsePointer ||
    maxTouchPoints > 0 ||
    'ontouchstart' in window;

  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;
  const shortSide = Math.min(vw, vh);
  const longSide = Math.max(vw, vh);

  // Explicit phone / mobile signals
  if (uaDataMobile || isPhoneUa) {
    return { kind: 'phone', hasTouch: true };
  }

  // Explicit tablet signals
  if (isTabletUa) {
    return { kind: 'tablet', hasTouch: true };
  }

  // Primary pointer is coarse & no hover (typical mobile/tablet browser or Chrome DevTools mobile mode)
  if (coarsePointer && !hoverCapable) {
    return {
      kind: shortSide >= 620 && longSide >= 880 ? 'tablet' : 'phone',
      hasTouch: true,
    };
  }

  // Narrow portrait viewport (e.g. phone or DevTools mobile emulator without touch sensor)
  if (vw <= 540 && vh <= 980) {
    return { kind: 'phone', hasTouch };
  }

  // Touch-enabled compact screen (excluding touchscreen laptops with fine mouse + large screen)
  if (hasTouch && !finePointer && shortSide <= 900) {
    return {
      kind: shortSide >= 620 ? 'tablet' : 'phone',
      hasTouch: true,
    };
  }

  return { kind: 'laptop', hasTouch };
}

export function resolveDeviceExperienceProfile(
  override: DeviceExperienceOverride = loadDeviceExperienceOverride(),
): DeviceExperienceProfile {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const { kind, hasTouch } = detectHardwareDeviceKind();

  const activeMode: ActiveDeviceMode =
    override === 'mobile'
      ? 'mobile'
      : override === 'laptop'
        ? 'laptop'
        : kind === 'laptop'
          ? 'laptop'
          : 'mobile';

  const isMobileExperience = activeMode === 'mobile';
  const label =
    override === 'auto'
      ? kind === 'phone'
        ? 'Auto · Mobile'
        : kind === 'tablet'
          ? 'Auto · Tablet'
          : 'Auto · Laptop'
      : override === 'mobile'
        ? 'Mobile Mode'
        : 'Laptop Mode';

  return {
    override,
    detectedKind: kind,
    activeMode,
    isMobileExperience,
    isLaptopExperience: !isMobileExperience,
    isPortrait: vh > vw,
    hasTouchInput: hasTouch || isMobileExperience,
    viewportWidth: vw,
    viewportHeight: vh,
    label,
  };
}

export function syncDeviceDocumentAttributes(profile: DeviceExperienceProfile): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.device = profile.activeMode;
  root.dataset.detectedDevice = profile.detectedKind;
  root.dataset.orientation = profile.isPortrait ? 'portrait' : 'landscape';
}

export function useDeviceExperience(): {
  profile: DeviceExperienceProfile;
  setDeviceOverride: (next: DeviceExperienceOverride) => void;
  cycleDeviceOverride: () => void;
} {
  const [profile, setProfile] = useState<DeviceExperienceProfile>(() => {
    const initial = resolveDeviceExperienceProfile();
    syncDeviceDocumentAttributes(initial);
    return initial;
  });

  useEffect(() => {
    const refresh = () => {
      const next = resolveDeviceExperienceProfile();
      syncDeviceDocumentAttributes(next);
      setProfile((prev) => {
        if (
          prev.override === next.override &&
          prev.detectedKind === next.detectedKind &&
          prev.activeMode === next.activeMode &&
          prev.isPortrait === next.isPortrait &&
          prev.hasTouchInput === next.hasTouchInput &&
          prev.viewportWidth === next.viewportWidth &&
          prev.viewportHeight === next.viewportHeight
        ) {
          return prev;
        }
        return next;
      });
    };

    refresh();

    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.addEventListener(DEVICE_CHANGE_EVENT, refresh);

    const mqCoarse = window.matchMedia?.('(pointer: coarse)');
    const mqHover = window.matchMedia?.('(hover: hover)');
    mqCoarse?.addEventListener?.('change', refresh);
    mqHover?.addEventListener?.('change', refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      window.removeEventListener(DEVICE_CHANGE_EVENT, refresh);
      mqCoarse?.removeEventListener?.('change', refresh);
      mqHover?.removeEventListener?.('change', refresh);
    };
  }, []);

  const setDeviceOverride = useCallback((next: DeviceExperienceOverride) => {
    saveDeviceExperienceOverride(next);
  }, []);

  const cycleDeviceOverride = useCallback(() => {
    const current = loadDeviceExperienceOverride();
    const order: DeviceExperienceOverride[] = ['auto', 'mobile', 'laptop'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    saveDeviceExperienceOverride(next);
  }, []);

  return { profile, setDeviceOverride, cycleDeviceOverride };
}
