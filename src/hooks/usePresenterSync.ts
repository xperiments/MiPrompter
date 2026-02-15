import { useEffect } from "react";
import type { ScriptDoc, PresenterAppearance } from "../types";
import { sendToPresenterViaWs } from "../lib/presenter-transport";
import type { PresenterMessage } from "../types";
import { EVT_WS_READY } from "../lib/keys";

export interface UsePresenterSyncParams {
  presenterWindowRef?: React.RefObject<Window | null>;
  /** Optional centralized send API from usePresenterBridge().send */
  send?: (msg: PresenterMessage) => boolean;
  activeScriptId: string | null;
  scripts: ScriptDoc[];
  presenterDisplayedDocRef?: React.MutableRefObject<string | null>;
  presenterDisplayedChapterRef?: React.MutableRefObject<string | null>;
}

export function usePresenterSync({
  presenterWindowRef,
  send,
  activeScriptId,
  scripts,
  presenterDisplayedDocRef,
  presenterDisplayedChapterRef,
}: UsePresenterSyncParams) {
  // Sync active document to presenter window — support both centralized send, postMessage and WS transport
  useEffect(() => {
    const win = presenterWindowRef?.current ?? null;
    const origin = window.location.origin;
    const activeDoc = scripts.find((s) => s.id === activeScriptId) ?? null;

    const msgLoad = { type: "presenter-load-doc", doc: activeDoc };
    const msgParams = { type: "set-params", docId: activeScriptId };

    // Preferred: use centralized `send` when available
    if (send) {
      send(msgLoad);
      send(msgParams);
    } else {
      // If we have a local presenter window, send via postMessage
      if (activeScriptId && win && !win.closed) {
        win.postMessage(msgLoad, origin);
        win.postMessage(msgParams, origin);
      }

      // sendToPresenterViaWs returns false if no WS transport registered
      sendToPresenterViaWs(msgLoad);
      sendToPresenterViaWs(msgParams);
    }

    if (presenterDisplayedDocRef && activeScriptId) {
      presenterDisplayedDocRef.current = activeScriptId;
    }
    if (presenterDisplayedChapterRef && activeDoc?.chapters?.[0]) {
      presenterDisplayedChapterRef.current = activeDoc.chapters[0].id;
    }
  }, [
    activeScriptId,
    scripts,
    presenterWindowRef,
    presenterDisplayedDocRef,
    presenterDisplayedChapterRef,
    send,
  ]);

  // Re-send current presenter state when a WS sender becomes available
  useEffect(() => {
    function onWsReady() {
      const win = presenterWindowRef?.current ?? null;
      const origin = window.location.origin;
      const activeDoc = scripts.find((s) => s.id === activeScriptId) ?? null;

      const msgLoad = { type: "presenter-load-doc", doc: activeDoc };
      const msgParams = { type: "set-params", docId: activeScriptId };

      if (send) {
        send(msgLoad);
        send(msgParams);
        return;
      }

      if (activeScriptId && win && !win.closed) {
        win.postMessage(msgLoad, origin);
        win.postMessage(msgParams, origin);
      }

      sendToPresenterViaWs(msgLoad);
      sendToPresenterViaWs(msgParams);
    }

    window.addEventListener(EVT_WS_READY, onWsReady as EventListener);

    // If a WS sender is already registered (race avoidance), trigger resync immediately
    try {
      // import guarded to avoid circular import at top-level — dynamic require-like access
      // (we import from presenter-transport at top of file already) — use the exported helper
      // `hasPresenterWsSender` to detect current registration state.
      // If registered, call onWsReady() so presenters that joined earlier still receive state.
      import("../lib/presenter-transport")
        .then((m) => {
          if (typeof m.hasPresenterWsSender === "function" && m.hasPresenterWsSender()) {
            onWsReady();
          }
        })
        .catch(() => {});
    } catch (_) {
      /* ignore */
    }

    return () => window.removeEventListener(EVT_WS_READY, onWsReady as EventListener);
  }, [activeScriptId, scripts, presenterWindowRef, send]);
}

export function updatePresenterWindow(
  presenterWindowRef: React.RefObject<Window | null>,
  updates: Partial<
    PresenterAppearance & { micDeviceId?: string | null; docId?: string }
  >,
) {
  const win = presenterWindowRef.current;

  // Separate appearance properties from other properties
  const { micDeviceId, docId, ...appearanceProps } = updates;
  const paramsMsg: Extract<PresenterMessage, { type: "set-params" }> = {
    type: "set-params",
    ...(Object.keys(appearanceProps).length > 0
      ? { appearance: appearanceProps as Partial<PresenterAppearance> }
      : {}),
  };

  if (micDeviceId !== undefined) paramsMsg.micDeviceId = micDeviceId;
  if (docId !== undefined) paramsMsg.docId = docId;

  let posted = false;
  if (win && !win.closed) {
    win.postMessage(paramsMsg, window.location.origin);
    posted = true;
  }

  // If WS transport is available, send there as well (covers phone presenters)

  const sent = sendToPresenterViaWs(paramsMsg);
  // If neither delivered, silently fail (existing behaviour)
  posted = posted || sent;

  return posted;
}
