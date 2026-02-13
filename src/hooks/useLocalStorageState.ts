import { useCallback, useEffect, useState } from "react";
import { lsGetJSON, lsSetJSON } from "../lib/local-storage";

// Lightweight, typed localStorage-backed state hook used across the app.
// - key: localStorage key
// - initial: default value (used when missing or on parse error)
// Behaves like useState but persists to localStorage and accepts functional updaters.
export function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const parsed = lsGetJSON<T>(key, null);
      return parsed == null ? initial : parsed;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    lsSetJSON(key, state);
  }, [key, state]);

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setState((prev) =>
      typeof v === "function" ? (v as (p: T) => T)(prev) : v,
    );
  }, []);

  return [state, set] as const;
}
