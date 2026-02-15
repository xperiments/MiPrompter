import { useEffect, useRef, useState, useCallback } from "react";import type { ScriptDoc } from "../types";import {
  openTeleprompter,
  type ScreenInfo,
  type Appearance as PresenterAppearance,
} from "../lib/presenter";
import { sendToPresenterViaWs } from "../lib/presenter-transport";
import type { PresenterMessage } from "../types";

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
  const subscribersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const [presenterState, setPresenterState] = useState<PresenterState>({
    playing: false,
    mic: false,
    windowOpen: false,
    wordIndex: 0,
  });

  useEffect(() => {
    function handlePresenterMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "presenter-ready") {
        setPresenterState((s) => ({ ...s, windowOpen: true }));
        presenterWindowRef.current = e.source as Window;
      }

      if (
        e.data?.type === "presenter-closed" ||
        e.data?.type === "presenter-unload"
      ) {
        setPresenterState((s) => ({ ...s, windowOpen: false }));

        if (presenterWindowRef.current === (e.source as Window))
          presenterWindowRef.current = null;
      }

      if (e.data?.type === "presenter-chapter-loaded") {
        presenterDisplayedDocRef.current = e.data.docId || null;
        presenterDisplayedChapterRef.current = e.data.chapterId || null;
      }
      if (e.data?.type === "presenter-playing")
        setPresenterState((s) => ({ ...s, playing: Boolean(e.data.playing) }));
      if (e.data?.type === "presenter-mic")
        setPresenterState((s) => ({ ...s, mic: Boolean(e.data.active) }));
      if (e.data?.type === "presenter-word-index")
        setPresenterState((s) => ({ ...s, wordIndex: Number(e.data.index) }));

      // notify local subscribers (typed handlers registered via `on`)

      const t = e.data?.type;
      if (t) {
        const handlers = subscribersRef.current.get(t);
        if (handlers) {
          handlers.forEach((h) => {
            h(e.data, {
              origin: e.origin,
              transport: "postMessage",
              source: e.source as MessageEventSource | null,
            });
          });
        }
      }
    }
    window.addEventListener("message", handlePresenterMessage);

    const id = window.setInterval(() => {
      const w = presenterWindowRef.current;
      if (!w) return setPresenterState((s) => ({ ...s, windowOpen: false }));
      if (w.closed) {
        presenterWindowRef.current = null;
        setPresenterState((s) => ({ ...s, windowOpen: false }));
      } else setPresenterState((s) => ({ ...s, windowOpen: true }));
    }, 800);

    return () => {
      window.removeEventListener("message", handlePresenterMessage);
      clearInterval(id);
    };
  }, []);

  const openPresenter = useCallback(
    (opts: {
      screen: ScreenInfo;
      docs?: ScriptDoc[];
      activeDocId?: string | null;
      appearance?: PresenterAppearance;
    }) => {

        const win = openTeleprompter({
          screen: opts.screen,
          docs: opts.docs,
          activeDocId: opts.activeDocId,
          appearance: opts.appearance,
          presenterWindowRef,
        });
        setPresenterState((s) => ({ ...s, windowOpen: Boolean(win) }));

        return win;

    },
    [],
  );

  // Provide a typed handler signature so subscribers get properly-typed payloads.
  type MessageHandler = (
    payload: PresenterMessage,
    meta: {
      origin: string;
      transport: "postMessage" | "ws";
      source?: MessageEventSource | null;
    },
  ) => void;

  const postToPresenter = useCallback((msg: PresenterMessage) => {

      const w = presenterWindowRef.current;
      if (w && !w.closed) {
        w.postMessage(msg, window.location.origin);
        return true;
      }

    return false;
  }, []);

  const send = useCallback(
    (msg: PresenterMessage) => {
      const okPost = postToPresenter(msg);
      const okWs = Boolean(sendToPresenterViaWs && sendToPresenterViaWs(msg));
      return okPost || okWs;
    },
    [postToPresenter],
  );

  const play = useCallback(() => send({ type: "play" }), [send]);
  const pause = useCallback(() => send({ type: "pause" }), [send]);
  const gotoChapter = useCallback(
    (chapterId: string) => send({ type: "presenter-goto-chapter", chapterId }),
    [send],
  );
  const setWordIndex = useCallback(
    (index: number) => send({ type: "set-word-index", index }),
    [send],
  );
  const updateParams = useCallback(
    (
      p: Partial<{
        appearance: PresenterAppearance;
        micDeviceId?: string | null;
        docId?: string;
      }>,
    ) => send({ type: "set-params", ...p }),
    [send],
  );

  const togglePlay = useCallback(
    (playing?: boolean) => {

        if (typeof playing === "boolean") {
          return playing ? play() : pause();
        }
        // fallback: toggle based on last-known state
        return presenterState.playing ? pause() : play();

    },
    [play, pause, presenterState.playing],
  );

  const closePresenter = useCallback(() => {

      const w = presenterWindowRef.current;
      if (w && !w.closed) {
        w.close();
        presenterWindowRef.current = null;
        setPresenterState((s) => ({ ...s, windowOpen: false }));
        return true;
      }

    presenterWindowRef.current = null;
    setPresenterState((s) => ({ ...s, windowOpen: false }));
    return false;
  }, []);

  const on = useCallback((type: string, handler: MessageHandler) => {
    const map = subscribersRef.current;
    let set = map.get(type);
    if (!set) {
      set = new Set();
      map.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) map.delete(type);
    };
  }, []);

  const displayedRefs = {
    presenterDisplayedDocRef,
    presenterDisplayedChapterRef,
  } as const;

  return {
    presenterWindowRef,
    presenterState,
    openPresenter,
    send,
    play,
    pause,
    togglePlay,
    gotoChapter,
    setWordIndex,
    updateParams,
    closePresenter,
    on,
    displayedRefs,
  } as const;
}
