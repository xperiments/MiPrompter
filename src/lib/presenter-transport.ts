// Placeholder transport file - WebSocket functionality has been removed
// This file is kept for backwards compatibility but no longer provides WS sender functionality

export type PresenterSender = (msg: any) => boolean;

export function setPresenterWsSender(s: PresenterSender | null) {
  // No-op - WebSocket sender removed
}

export function sendToPresenterViaWs(msg: any): boolean {
  // No-op - WebSocket functionality removed
  return false;
}
