import { useEffect } from 'react';
import type { ScriptDoc, PresenterAppearance } from '../types';
import { sendToPresenterViaWs } from '../lib/presenter-transport';

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

    const msgLoad = { type: 'presenter-load-doc', doc: activeDoc };
    const msgParams = { type: 'set-params', docId: activeScriptId };

    // Preferred: use centralized `send` when available
    if (send) {
      try {
        send(msgLoad);
        send(msgParams);
      } catch (_) {
        /* ignore */
      }
    } else {
      // If we have a local presenter window, send via postMessage
      if (activeScriptId && win && !win.closed) {
        try {
          win.postMessage(msgLoad, origin);
          win.postMessage(msgParams, origin);
        } catch {
          /* ignore */
        }
      }

      // Also attempt WS transport (covers phone presenters and remote clients)
      try {
        // sendToPresenterViaWs returns false if no WS transport registered
        sendToPresenterViaWs(msgLoad);
        sendToPresenterViaWs(msgParams);
      } catch (_) {
        /* ignore */
      }
    }

    if (presenterDisplayedDocRef && activeScriptId) {
      presenterDisplayedDocRef.current = activeScriptId;
    }
    if (presenterDisplayedChapterRef && activeDoc?.chapters?.[0]) {
      presenterDisplayedChapterRef.current = activeDoc.chapters[0].id;
    }
  }, [activeScriptId, scripts, presenterWindowRef, presenterDisplayedDocRef, presenterDisplayedChapterRef, send]);
}

export function updatePresenterWindow(
  presenterWindowRef: React.RefObject<Window | null>,
  updates: Partial<PresenterAppearance & { micDeviceId?: string | null; docId?: string }>
) {
  try {
    const win = presenterWindowRef.current;

    // Separate appearance properties from other properties
    const { micDeviceId, docId, ...appearanceProps } = updates;
    const message: any = { type: 'set-params' };
    
    if (micDeviceId !== undefined) message.micDeviceId = micDeviceId;
    if (docId !== undefined) message.docId = docId;
    if (Object.keys(appearanceProps).length > 0) message.appearance = appearanceProps;

    let posted = false;
    if (win && !win.closed) {
      try {
        win.postMessage(message, window.location.origin);
        posted = true;
      } catch {
        /* ignore */
      }
    }

    // If WS transport is available, send there as well (covers phone presenters)
    try {
      const sent = sendToPresenterViaWs(message);
      // If neither delivered, silently fail (existing behaviour)
      posted = posted || sent;
    } catch (_) {}

    return posted;
  } catch {
    // Ignore postMessage errors
    return false;
  }
}
