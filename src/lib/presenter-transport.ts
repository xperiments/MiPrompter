import type { ScriptDoc, PresenterAppearance } from "../types";

// Discriminated union of the most-common presenter messages used across the app
export type PresenterMessage =
  | { type: "play" }
  | { type: "pause" }
  | { type: "presenter-goto-chapter"; chapterId: string }
  | { type: "set-word-index"; index: number }
  | {
      type: "set-params";
      docId?: string | null;
      micDeviceId?: string | null;
      appearance?: Partial<PresenterAppearance>;
    }
  | { type: "presenter-load-doc"; doc: ScriptDoc | null }
  | { type: "presenter-init"; docId?: string | null; doc?: ScriptDoc | null; appearance?: Partial<PresenterAppearance> }
  | { type: "update-chapter"; chapterId: string; text: string }
  | { type: "presenter-voice-commands"; config: unknown | null }
  | { type: "prompter-reset" }
  // messages emitted by presenter -> controller (kept here for handler typing)
  | { type: "presenter-ready" }
  | { type: "presenter-playing"; playing: boolean }
  | { type: "presenter-mic"; active: boolean }
  | { type: "presenter-word-index"; index: number }
  | { type: "presenter-chapter-loaded"; docId?: string | null; chapterId?: string | null }
  // fallback for messages not yet enumerated
  | ({ type: string } & Record<string, unknown>);

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
