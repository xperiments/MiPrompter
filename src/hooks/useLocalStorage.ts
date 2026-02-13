import { useMemo } from "react";
import { lsGet, lsSet, lsRemove, lsGetJSON, lsSetJSON } from "../lib/local-storage";
export function useLocalStorage() {
  return useMemo(
    () => ({ getRaw: lsGet, setRaw: lsSet, remove: lsRemove, getJSON: lsGetJSON, setJSON: lsSetJSON }),
    [],
  );
}

// Re-export the existing stateful hook for convenience/compatibility
export { useLocalStorageState } from "./useLocalStorageState";
