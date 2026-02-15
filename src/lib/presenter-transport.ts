import type { ScriptDoc, PresenterAppearance, PresenterMessage } from "../types";

/**
 * Runtime type-guard for PresenterMessage. This is intentionally conservative
 * (checks `type` and required primitive fields) and used by tests and any
 * future runtime validation without changing existing behavior.
 */
export function isPresenterMessage(v: unknown): v is PresenterMessage {
  if (!v || typeof v !== "object") return false;
  const t = (v as any).type;
  if (typeof t !== "string") return false;

  switch (t) {
    case "play":
    case "pause":
    case "presenter-ready":
    case "prompter-reset":
      return true;
    case "presenter-playing":
      return typeof (v as any).playing === "boolean";
    case "presenter-mic":
      return typeof (v as any).active === "boolean";
    case "set-word-index":
    case "presenter-word-index":
      return typeof (v as any).index === "number";
    case "presenter-goto-chapter":
      return typeof (v as any).chapterId === "string";
    case "set-params":
      return (
        (v as any).docId === undefined || typeof (v as any).docId === "string" || (v as any).docId === null
      );
    case "presenter-load-doc":
    case "presenter-init":
      return true; // `doc` can be any ScriptDoc|null — keep permissive
    default:
      // unknown message types are allowed (legacy/extension points)
      return true;
  }
}

export type PresenterSender = (msg: PresenterMessage) => boolean;

let _presenterWsSender: PresenterSender | null = null;

/**
 * Register a function that will be used to send messages to a remote presenter
 * via the signaling WebSocket (room-aware). Pass `null` to clear the sender.
 */
export function setPresenterWsSender(s: PresenterSender | null) {
  _presenterWsSender = s;
}

/**
 * Send a message to the presenter via the registered WS sender (if any).
 * Returns true when a sender exists and the send was attempted.
 */
export function sendToPresenterViaWs(msg: PresenterMessage): boolean {
  try {
    if (!_presenterWsSender) return false;
    return Boolean(_presenterWsSender(msg));
  } catch {
    return false;
  }
}

/**
 * Returns whether a WS sender has been registered (useful to avoid race conditions)
 */
export function hasPresenterWsSender(): boolean {
  return Boolean(_presenterWsSender);
}
