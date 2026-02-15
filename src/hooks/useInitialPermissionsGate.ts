import { useEffect, useState, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { getBasicCameraStream, getAudioVideoStream } from "../lib/media-devices";
import { INITIAL_PERMISSIONS_KEY, FORCE_SHOW_PERMISSION_OVERLAY, EVT_PERMISSIONS_UPDATED } from "../lib/keys";

// Encapsulates the permission-overlay logic previously in App.tsx.
// Returns a boolean to show the overlay and a gesture-primed click handler.
// Also attaches a one-time `pointerdown` priming listener that calls the
// permissions APIs (keeps behavior identical to the prior inlined logic).
export function useInitialPermissionsGate() {
  const ls = useLocalStorage();
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (ls.getRaw(FORCE_SHOW_PERMISSION_OVERLAY) === "1") {
          if (!mounted) return;
          setShowOverlay(true);
          return;
        }

        const alreadyAsked = Boolean(ls.getRaw(INITIAL_PERMISSIONS_KEY));
        let micGranted = false;
        let camGranted = false;
        try {
          const mp = await (navigator.permissions as any).query?.({
            name: "microphone",
          });
          micGranted = mp?.state === "granted";
        } catch (_) {
          micGranted = false;
        }
        try {
          const vp = await (navigator.permissions as any).query?.({
            name: "camera",
          });
          camGranted = vp?.state === "granted";
        } catch (_) {
          camGranted = false;
        }

        if (!mounted) return;
        // Show overlay if we haven't already asked, or if either mic or camera isn't granted
        setShowOverlay(!alreadyAsked || !micGranted || !camGranted);
      } catch (_) {
        if (!mounted) return;
        setShowOverlay(true);
      }
    })();

    // pointerdown priming: identical behavior to the previous inline effect
    // in App — starts a permissions probe on first user gesture and marks
    // INITIAL_PERMISSIONS_KEY so we don't spam the prompt.
    const key = INITIAL_PERMISSIONS_KEY;
    function onFirstGesture() {
      document.removeEventListener("pointerdown", onFirstGesture, true);

      const micPromise = (async () => {
        let p: any | undefined;
        try {
          p = await (navigator.permissions as any).query({
            name: "microphone",
          });
        } catch {
          p = undefined;
        }
        if (p == null || p.state === "prompt") {
          navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
        }
      })();

      const camPromise = (async () => {
        let p: any | undefined;
        try {
          p = await (navigator.permissions as any).query({ name: "camera" });
        } catch {
          p = undefined;
        }
        if (p == null || p.state === "prompt") {
          getBasicCameraStream().catch(() => {});
        }
      })();

      const screenPromise = (async () => {
        const gd = (window as any).getScreenDetails;
        if (typeof gd === "function") {
          (gd as any)().catch(() => {});
        }
      })();


        ls.setRaw(key, "1");


      Promise.allSettled([micPromise, screenPromise])
        .then(() => {
          window.dispatchEvent(new Event(EVT_PERMISSIONS_UPDATED));
        })
        .catch(() => {});
    }

    document.addEventListener("pointerdown", onFirstGesture, { capture: true });

    return () => {
      document.removeEventListener("pointerdown", onFirstGesture, true);
      mounted = false;
    };
  }, [ls]);

  const onOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const x = (e as any).clientX ?? window.innerWidth / 2;
    const y = (e as any).clientY ?? window.innerHeight / 2;

    getAudioVideoStream().catch(() => {});

    (window as any).getScreenDetails?.().catch(() => {});

    ls.setRaw(INITIAL_PERMISSIONS_KEY, "1");

    const overlay = e.currentTarget as HTMLElement | null;
    if (overlay) {
      overlay.style.pointerEvents = "none";
      const underlying = document.elementFromPoint(x, y) as HTMLElement | null;
      if (underlying) {
        try {
          underlying.click();
        } catch (_) {
          underlying.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              clientX: x,
              clientY: y,
            }),
          );
        }
      }
      overlay.style.pointerEvents = "";
    }

    setTimeout(() => {
      window.dispatchEvent(new Event(EVT_PERMISSIONS_UPDATED));

      setShowOverlay(false);
    }, 250);
  }, []);

  return { showOverlay, onOverlayClick } as const;
}
