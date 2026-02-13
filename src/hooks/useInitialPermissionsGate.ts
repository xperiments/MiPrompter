import { useEffect, useState, useCallback } from "react";

// Encapsulates the permission-overlay logic previously in App.tsx.
// Returns a boolean to show the overlay and a gesture-primed click handler.
// Also attaches a one-time `pointerdown` priming listener that calls the
// permissions APIs (keeps behavior identical to the prior inlined logic).
export function useInitialPermissionsGate() {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        try {
          if (localStorage.getItem('smui.forceShowPermissionOverlay') === '1') {
            if (!mounted) return;
            setShowOverlay(true);
            return;
          }
        } catch (_) {}

        const alreadyAsked = Boolean(localStorage.getItem('smui.initialPermissionsRequested'));
        let micGranted = false;
        let camGranted = false;
        try {
          const mp = await (navigator.permissions as any).query?.({ name: 'microphone' });
          micGranted = mp?.state === 'granted';
        } catch (_) {
          micGranted = false;
        }
        try {
          const vp = await (navigator.permissions as any).query?.({ name: 'camera' });
          camGranted = vp?.state === 'granted';
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
    // `smui.initialPermissionsRequested` so we don't spam the prompt.
    const key = 'smui.initialPermissionsRequested';
    function onFirstGesture() {
      try { document.removeEventListener('pointerdown', onFirstGesture, true); } catch (err) { /* ignore */ }

      const micPromise = (async () => {
        try {
          let p: any | undefined;
          try { p = await (navigator.permissions as any).query({ name: 'microphone' }); } catch { p = undefined; }
          if (p == null || p.state === 'prompt') {
            try { navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {}); } catch (err) { /* ignore */ }
          }
        } catch (err) { /* ignore */ }
      })();

      const camPromise = (async () => {
        try {
          let p: any | undefined;
          try { p = await (navigator.permissions as any).query({ name: 'camera' }); } catch { p = undefined; }
          if (p == null || p.state === 'prompt') {
            try { navigator.mediaDevices.getUserMedia({ video: true }).catch(() => {}); } catch (err) { /* ignore */ }
          }
        } catch (err) { /* ignore */ }
      })();

      const screenPromise = (async () => {
        try {
          const gd = (window as any).getScreenDetails;
          if (typeof gd === 'function') {
            try { (gd as any)().catch(() => {}); } catch (err) { /* ignore */ }
          }
        } catch (err) { /* ignore */ }
      })();

      try { localStorage.setItem(key, '1'); } catch (err) { /* ignore */ }

      Promise.allSettled([micPromise, screenPromise]).then(() => {
        try { window.dispatchEvent(new Event('smui.permissions-updated')); } catch (err) { /* ignore */ }
      }).catch(() => {});
    }

    document.addEventListener('pointerdown', onFirstGesture, { capture: true });

    return () => { document.removeEventListener('pointerdown', onFirstGesture, true); mounted = false; };
  }, []);

  const onOverlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const x = (e as any).clientX ?? window.innerWidth / 2;
    const y = (e as any).clientY ?? window.innerHeight / 2;

    try { (navigator.mediaDevices.getUserMedia({ audio: true, video: true }) as Promise<MediaStream>).catch(() => {}); } catch (_) { /* ignore */ }
    try { (window as any).getScreenDetails?.().catch(() => {}); } catch (_) { /* ignore */ }

    try { localStorage.setItem('smui.initialPermissionsRequested', '1'); } catch (_) { /* ignore */ }

    const overlay = e.currentTarget as HTMLElement | null;
    if (overlay) {
      overlay.style.pointerEvents = 'none';
      const underlying = document.elementFromPoint(x, y) as HTMLElement | null;
      if (underlying) {
        try { underlying.click(); } catch (_) { try { underlying.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); } catch (_) { /* ignore */ } }
      }
      overlay.style.pointerEvents = '';
    }

    setTimeout(() => {
      try { window.dispatchEvent(new Event('smui.permissions-updated')); } catch (_) { /* ignore */ }
      setShowOverlay(false);
    }, 250);
  }, []);

  return { showOverlay, onOverlayClick } as const;
}
