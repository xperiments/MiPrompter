// Safe, centralized localStorage helpers used across the app.
// - Provides defensive try/catch and SSR-safety (checks for window).
// - Exposes raw (string) and JSON get/set helpers.

export function lsGet(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch (err) {
    console.debug(`[ls] get failed for ${key}`, err);
    return null;
  }
}

export function lsSet(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null || typeof value === "undefined") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch (err) {
    console.debug(`[ls] set failed for ${key}`, err);
  }
}

export function lsRemove(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch (err) {
    console.debug(`[ls] remove failed for ${key}`, err);
  }
}

export function lsGetJSON<T = any>(key: string, fallback: T | null = null): T | null {
  const raw = lsGet(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.debug(`[ls] JSON parse failed for ${key}`, err);
    return fallback;
  }
}

export function lsSetJSON(key: string, v: unknown): void {
  if (typeof v === "undefined" || v === null) {
    lsRemove(key);
    return;
  }
  try {
    lsSet(key, JSON.stringify(v));
  } catch (err) {
    console.debug(`[ls] JSON stringify failed for ${key}`, err);
  }
}
