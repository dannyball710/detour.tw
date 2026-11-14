// Storage can throw (private mode, blocked site data) — every access degrades to "nothing stored".

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Not persisting is acceptable; the feature just won't remember.
  }
}

export const KEYS = {
  device: 'detour:device',
  contribute: 'detour:contribute',
  lang: 'detour:lang',
  langBanner: 'detour:lang-banner-dismissed',
} as const
