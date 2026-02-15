import { useState, useEffect, useRef } from "react";
import type { ScreenInfo } from "../lib/presenter";

import { SCREEN_STORAGE_KEY, EVT_PERMISSIONS_UPDATED } from "../lib/keys";

import { lsGet, lsSet } from "../lib/local-storage";

function getStoredScreen(): string | null {
  return lsGet(SCREEN_STORAGE_KEY);
}

function persistScreen(label: string): void {
  lsSet(SCREEN_STORAGE_KEY, label);
}

function getPrimaryScreenLabel(): string {
  return `Primary — ${window.screen.width}×${window.screen.height}`;
}

function selectPreferredScreen(
  screens: ScreenInfo[],
  storedLabel: string | null,
): ScreenInfo {
  if (storedLabel) {
    const fromStore = screens.find(
      (s) => s.id === storedLabel || s.label === storedLabel,
    );
    if (fromStore) return fromStore;
  }

  const primary = screens.find((s) => s.isPrimary);
  if (primary) return primary;

  return screens.reduce((a, b) =>
    a.width * a.height > b.width * b.height ? a : b,
  );
}

export function useScreenDetection() {
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [selectedScreenLabel, setSelectedScreenLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedScreenRef = useRef<string | null>(getStoredScreen());

  async function detectScreens() {
    setError(null);
    setLoading(true);

    try {
      const details = await (window as any).getScreenDetails?.();

      if (
        details?.screens &&
        Array.isArray(details.screens) &&
        details.screens.length > 0
      ) {
        const current = details.currentScreen ?? null;

        const list: ScreenInfo[] = details.screens.map((s: any, i: number) => {
          const left = Number(s.left ?? s.availLeft ?? 0);
          const top = Number(s.top ?? s.availTop ?? 0);
          const width = Number(s.width ?? s.availWidth ?? window.screen.width);
          const height = Number(
            s.height ?? s.availHeight ?? window.screen.height,
          );

          // Prefer explicit `isPrimary` when provided by the UA.
          // If `currentScreen` is available from ScreenDetails, prefer that as the primary
          // (this is the screen containing the browsing context). Otherwise fall back to
          // heuristics (position at 0,0 or matching window.screen size).
          const matchesCurrent = current
            ? Number(current.left ?? current.availLeft ?? 0) === left &&
              Number(current.top ?? current.availTop ?? 0) === top &&
              Number(
                current.width ?? current.availWidth ?? window.screen.width,
              ) === width &&
              Number(
                current.height ?? current.availHeight ?? window.screen.height,
              ) === height
            : false;

          const inferredPrimary =
            matchesCurrent ||
            (left === 0 && top === 0) ||
            (width === window.screen.width && height === window.screen.height);

          return {
            id: String(i),
            left,
            top,
            width,
            height,
            isPrimary: Boolean(s.isPrimary) || inferredPrimary,
            label:
              s.label ??
              `Display ${i + 1} — ${Math.round(width)}×${Math.round(height)}`,
          };
        });

        setScreens(list);
        // Prefer the currently-selected label (if still valid), otherwise fall
        // back to persisted preference and finally to primary/largest.
        const preferredLabel =
          selectedScreenLabel || storedScreenRef.current || null;
        const preferred = selectPreferredScreen(list, preferredLabel);
        setSelectedScreenLabel(preferred.label);
      } else {
        // Fallback to primary screen
        const primaryLabel = getPrimaryScreenLabel();
        setScreens([
          {
            id: "0",
            left: 0,
            top: 0,
            width: window.screen.width,
            height: window.screen.height,
            isPrimary: true,
            label: primaryLabel,
          },
        ]);
        // don't clobber an in-memory selection if one exists — prefer it, then stored value
        setSelectedScreenLabel(
          selectedScreenLabel || (storedScreenRef.current ?? primaryLabel),
        );
      }
    } catch (err: any) {
      setError(String(err?.message ?? err ?? "Failed to enumerate screens"));

      // Fallback to primary screen on error
      const primaryLabel = getPrimaryScreenLabel();
      setScreens([
        {
          id: "0",
          left: 0,
          top: 0,
          width: window.screen.width,
          height: window.screen.height,
          isPrimary: true,
          label: primaryLabel,
        },
      ]);
      setSelectedScreenLabel(storedScreenRef.current ?? primaryLabel);
    } finally {
      setLoading(false);
    }
  }

  // Detect screens on mount and listen for permissions updates
  useEffect(() => {
    detectScreens();

    function handlePermissionsUpdate() {
      detectScreens();
    }

    window.addEventListener(EVT_PERMISSIONS_UPDATED, handlePermissionsUpdate);
    return () => {
      window.removeEventListener(EVT_PERMISSIONS_UPDATED, handlePermissionsUpdate);
    };
  }, []);

  // Persist selected screen (and keep the storedScreenRef in sync so
  // subsequent detection runs can prefer the most-recent persisted value).
  useEffect(() => {
    if (selectedScreenLabel) {
      persistScreen(selectedScreenLabel);
      storedScreenRef.current = selectedScreenLabel;
    }
  }, [selectedScreenLabel]);

  return {
    screens,
    selectedScreenLabel,
    setSelectedScreenLabel,
    loading,
    error,
    refresh: detectScreens,
  };
}
