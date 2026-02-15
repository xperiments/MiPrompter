// Lightweight logger utility — minimal API used across the app.
// - `debug` is gated by an environment-driven flag (off in production).
// - `info`/`warn`/`error` forward to console.* so behaviour is preserved.

let _debugEnabled = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production')
  || Boolean((import.meta as any)?.env?.DEV);

export function enableDebug(v: boolean) {
  _debugEnabled = Boolean(v);
}

export function isDebugEnabled() {
  return _debugEnabled;
}

export function debug(...args: unknown[]) {
  if (!_debugEnabled) return;
  // use console.debug when available so devtools can filter
  (console as any).debug?.(...args);
}

export function info(...args: unknown[]) {
  console.info(...args);
}

export function warn(...args: unknown[]) {
  console.warn(...args);
}

export function error(...args: unknown[]) {
  console.error(...args);
}
