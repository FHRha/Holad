/**
 * Unified platform and environment detection helpers for Holad.
 *
 * Strictly separates:
 * - Runtime host (`isTauri`, `isTauriAndroid`, `isTauriMobile`, `isTauriDesktop`)
 * - OS/form-factor (`isMobilePlatform`) — NEVER uses viewport width
 * - UI layout mode (`isMobileClient`, `isDesktopClient`) — may use viewport width <= 768px
 */

const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod|Mobile/i;
const MOBILE_PLATFORM_REGEX = /Android|iPhone|iPad|iPod/i;
const ANDROID_REGEX = /Android/i;

function getUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
}

function getNavigatorPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  return (navigator as Navigator & { userAgentData?: { platform?: string } })?.userAgentData?.platform || navigator.platform || '';
}

function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
}

/**
 * Returns true when running inside a Tauri WebView (desktop or Android/iOS).
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined;
}

/**
 * Returns true when running inside Tauri on Android.
 * Never uses viewport width.
 */
export function isTauriAndroid(): boolean {
  if (!isTauri()) return false;
  return ANDROID_REGEX.test(getUserAgent()) || ANDROID_REGEX.test(getNavigatorPlatform());
}

/**
 * Returns true when running inside Tauri on a mobile OS/device (Android/iOS or coarse pointer).
 * Never uses viewport width.
 */
export function isTauriMobile(): boolean {
  if (!isTauri()) return false;
  if (isTauriAndroid()) return true;
  if (MOBILE_UA_REGEX.test(getUserAgent())) return true;
  if (MOBILE_PLATFORM_REGEX.test(getNavigatorPlatform())) return true;
  return hasCoarsePointer();
}

/**
 * Returns true when running inside Tauri on a desktop OS.
 */
export function isTauriDesktop(): boolean {
  return isTauri() && !isTauriMobile();
}

/**
 * Returns true on mobile OS/form-factor (Tauri mobile or mobile web browser).
 * Never uses viewport width — safe for audio defaults, volume multipliers, media session, etc.
 */
export function isMobilePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTauriMobile()) return true;
  if (isTauriDesktop()) return false;
  return MOBILE_UA_REGEX.test(getUserAgent()) || MOBILE_PLATFORM_REGEX.test(getNavigatorPlatform()) || hasCoarsePointer();
}

/**
 * Returns true when the UI should render in mobile layout (mobile platform or viewport <= 768px).
 */
export function isMobileClient(): boolean {
  if (typeof window === 'undefined') return false;
  if (isMobilePlatform()) return true;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches) return true;
  return window.innerWidth <= 768;
}

/**
 * Returns true when the UI should render in desktop layout.
 */
export function isDesktopClient(): boolean {
  return !isMobileClient();
}
