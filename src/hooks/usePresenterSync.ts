import { useEffect } from "react";
import type { ScriptDoc, PresenterAppearance } from "../types";
import { sendToPresenterViaWs } from "../lib/presenter-transport";

export interface UsePresenterSyncParams {
  presenterWindowRef?: React.RefObject<Window | null>;
  /** Optional centralized send API from usePresenterBridge().send */
  send?: (msg: any) => boolean;
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

  // Re-send current presenter state when a WS sender becomes available (smui.ws-ready)
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

    window.addEventListener("smui.ws-ready", onWsReady as EventListener);

    // If a WS sender is already registered (race avoidance), trigger resync immediately
    try {
      // import guarded to avoid circular import at top-level — dynamic require-like access
      // (we import from presenter-transport at top of file already) — use the exported helper
      // `hasPresenterWsSender` to detect current registration state.
      // If registered, call onWsReady() so presenters that joined earlier still receive state.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { hasPresenterWsSender } = require("../lib/presenter-transport");
      if (typeof hasPresenterWsSender === "function" && hasPresenterWsSender()) {
        onWsReady();
      }
    } catch (_) {
      /* ignore */
    }

    return () => window.removeEventListener("smui.ws-ready", onWsReady as EventListener);
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
  const message: any = { type: "set-params" };

  if (micDeviceId !== undefined) message.micDeviceId = micDeviceId;
  if (docId !== undefined) message.docId = docId;
  if (Object.keys(appearanceProps).length > 0)
    message.appearance = appearanceProps;

  let posted = false;
  if (win && !win.closed) {
    win.postMessage(message, window.location.origin);
    posted = true;
  }

  // If WS transport is available, send there as well (covers phone presenters)

  const sent = sendToPresenterViaWs(message);
  // If neither delivered, silently fail (existing behaviour)
  posted = posted || sent;

  return posted;
}
