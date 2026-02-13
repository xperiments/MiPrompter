import { useEffect, useRef, useState, useCallback } from "react";
import { openTeleprompter, type ScreenInfo, type Appearance as PresenterAppearance } from "../lib/presenter";

type PresenterState = {
  playing: boolean;
  mic: boolean;
  windowOpen: boolean;
  wordIndex?: number;
};

// Encapsulates presenter-message handling and lifecycle checks.
// - keeps a ref to the presenter window
// - exposes current presenter runtime state
// - provides an `openPresenter` convenience wrapper (thin) and `togglePlay`
// - exposes displayed refs for sync-awareness
export function usePresenterBridge() {
  const presenterWindowRef = useRef<Window | null>(null);
  const presenterDisplayedDocRef = useRef<string | null>(null);
  const presenterDisplayedChapterRef = useRef<string | null>(null);
  const [presenterState, setPresenterState] = useState<PresenterState>({ playing: false, mic: false, windowOpen: false, wordIndex: 0 });

  useEffect(() => {
    function handlePresenterMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'presenter-ready') {
        setPresenterState(s => ({ ...s, windowOpen: true }));
        try { presenterWindowRef.current = e.source as Window; } catch (err) { /* ignore */ }
      }

      if (e.data?.type === 'presenter-closed' || e.data?.type === 'presenter-unload') {
        setPresenterState(s => ({ ...s, windowOpen: false }));
        try { if (presenterWindowRef.current === (e.source as Window)) presenterWindowRef.current = null; } catch (err) { /* ignore */ }
      }

      if (e.data?.type === "presenter-chapter-loaded") {
        presenterDisplayedDocRef.current = e.data.docId || null;
        presenterDisplayedChapterRef.current = e.data.chapterId || null;
      }
      if (e.data?.type === 'presenter-playing') setPresenterState(s => ({ ...s, playing: Boolean(e.data.playing) }));
      if (e.data?.type === 'presenter-mic') setPresenterState(s => ({ ...s, mic: Boolean(e.data.active) }));
      if (e.data?.type === 'presenter-word-index') setPresenterState(s => ({ ...s, wordIndex: Number(e.data.index) }));
    }
    window.addEventListener('message', handlePresenterMessage);

    const id = window.setInterval(() => {
      try {
        const w = presenterWindowRef.current;
        if (!w) return setPresenterState(s => ({ ...s, windowOpen: false }));
        if (w.closed) {
          presenterWindowRef.current = null;
          setPresenterState(s => ({ ...s, windowOpen: false }));
        } else setPresenterState(s => ({ ...s, windowOpen: true }));
      } catch (err) { /* ignore */ }
    }, 800);

    return () => {
      window.removeEventListener('message', handlePresenterMessage);
      clearInterval(id);
    };
  }, []);

  const openPresenter = useCallback((opts: { screen: ScreenInfo; docs?: any[]; activeDocId?: string | null; appearance?: PresenterAppearance }) => {
    try {
      const win = openTeleprompter({ screen: opts.screen, docs: opts.docs, activeDocId: opts.activeDocId, appearance: opts.appearance, presenterWindowRef });
      setPresenterState(s => ({ ...s, windowOpen: Boolean(win) }));
      
      return win;
    } catch (err) {
      return null;
    }
  }, []);

  const sendToPresenter = useCallback((msg: any) => {
    try {
      const w = presenterWindowRef.current;
      if (w && !w.closed) {
        w.postMessage(msg, window.location.origin);
        return true;
      }
    } catch (_) {}
    return false;
  }, []);

  const togglePlay = useCallback((playing?: boolean) => {
    try {
      sendToPresenter({ type: 'toggle-play', playing: typeof playing === 'boolean' ? playing : undefined });
    } catch (err) { /* ignore */ }
  }, [sendToPresenter]);

  const displayedRefs = { presenterDisplayedDocRef, presenterDisplayedChapterRef } as const;

  return { presenterWindowRef, presenterState, openPresenter, togglePlay, displayedRefs } as const;
}
