export type PresenterSender = (msg: any) => boolean;

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
export function sendToPresenterViaWs(msg: any): boolean {
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
