// Project-specific window globals used for dev/debug hooks and cross-window helpers
declare global {
  interface Window {
    __smui_pairedDevices?: Array<{
      id: string;
      label?: string;
      ua?: string;
      screen?: { width?: number; height?: number };
      createdAt?: number;
      lastSeen?: number;
    }>;
    __smui_composerStream?: MediaStream | undefined;
    __smui_presenterPairId?: string | undefined;
    __smui_deferredInstallPrompt?: unknown;
    __smui_activateUpdate?: (() => Promise<void>) | undefined;
  }
}

export {};
