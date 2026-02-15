/* Utilities for opening / initializing the presenter window (teleprompter).
 * Reusable from Sidebar, BottomBar, tests, etc.
 * PostMessage-only version (no __presenterInit).
 */

export type ScreenInfo = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary?: boolean;
  label: string;
};

export type Appearance = {
  editor?: {
    width?: number;
    fontSize?: number;
  };
  presenter?: {
    alignment?: "left" | "center" | "right";
    mirrorMode?: boolean;
    showStopSigns?: boolean;
    voiceCommands?: boolean;
    rotateScreen?: boolean;
    preserveFormatting?: boolean;
    smoothAnimations?: boolean;
    highlightActiveWord?: boolean;
    fontSize?: number;
    // Selected font-family (Google Fonts key, e.g. 'Inter' or 'Open+Sans')
    fontFamily?: string;
    // Selected video input device id (deviceId) — undefined/null means None
    videoDeviceId?: string | null;
    lineSpacing?: number;
    paragraphSpacing?: number;
    sideMargins?: number;
    activeLinePosition?: number;
    // centerline controls
    showCenterline?: boolean;
    activeLineGuideHeight?: number;

    // overlay controls
    showOverlay?: boolean;
    overlayShape?: "camera" | "circle" | "cross" | "snap" | "square";
    overlayColor?: string;
    overlayOpacity?: number;
    overlayPosX?: number;
    overlayPosY?: number;
  };
};

import type { ScriptDoc } from "../types";

type OpenOpts = {
  screen: ScreenInfo;
  docs?: ScriptDoc[];
  activeDocId?: string | null;
  appearance?: Appearance;
  presenterWindowRef?: { current: Window | null } | null | undefined;
  windowName?: string;
  features?: string;
};

type PresenterInitMessage = {
  type: "presenter-init";
  docId: string | null | undefined;
  doc: ScriptDoc | null;
  appearance: {
    fontSize?: number;
    sideMargins: number;
    lineSpacing: number;
    // centerline controls
    activeLinePosition: number;
    activeLineGuideHeight?: number;
    showCenterline?: boolean;
    paragraphSpacing: number;
    highlightActiveWord: boolean;
    // Selected font-family
    fontFamily?: string;
    // Selected video input device id (deviceId) — undefined/null means None
    videoDeviceId?: string | null;
    alignment: "left" | "center" | "right";
    mirrorMode: boolean;
    voiceCommands: boolean;
    rotateScreen: boolean;
    preserveFormatting: boolean;
    smoothAnimations: boolean;
    showStopSigns: boolean;

    // overlay controls
    showOverlay?: boolean;
    overlayShape?: "camera" | "circle" | "cross" | "snap" | "square";
    overlayColor?: string;
    overlayOpacity?: number;
    overlayPosX?: number;
    overlayPosY?: number;
  };
};

const defaultPresenterAppearance = {
  sideMargins: 8,
  lineSpacing: 140,
  activeLinePosition: 35,
  // centerline defaults
  showCenterline: false,
  activeLineGuideHeight: 2,
  paragraphSpacing: 0.5,
  alignment: "center" as const,
  // default font
  fontFamily: "Inter",
  // no default camera
  videoDeviceId: undefined,
  highlightActiveWord: true,
  mirrorMode: false,
  voiceCommands: false,
  rotateScreen: false,
  preserveFormatting: true,
  smoothAnimations: false,
  showStopSigns: false,
  // overlay defaults
  showOverlay: false,
  overlayShape: "snap" as const,
  overlayColor: "#2563eb",
  overlayOpacity: 80,
  overlayPosX: 50,
  overlayPosY: 60,
};

function normalizePresenterAppearance(
  p?: Appearance["presenter"],
): PresenterInitMessage["appearance"] {
  return {
    fontSize: p?.fontSize,
    sideMargins: p?.sideMargins ?? defaultPresenterAppearance.sideMargins,
    lineSpacing: p?.lineSpacing ?? defaultPresenterAppearance.lineSpacing,
    activeLinePosition:
      p?.activeLinePosition ?? defaultPresenterAppearance.activeLinePosition,
    // centerline controls
    showCenterline:
      p?.showCenterline ?? defaultPresenterAppearance.showCenterline,
    activeLineGuideHeight:
      p?.activeLineGuideHeight ??
      defaultPresenterAppearance.activeLineGuideHeight,
    paragraphSpacing:
      p?.paragraphSpacing ?? defaultPresenterAppearance.paragraphSpacing,
    // font
    fontFamily: p?.fontFamily ?? defaultPresenterAppearance.fontFamily,
    // video input (deviceId) — undefined means None
    videoDeviceId: p?.videoDeviceId ?? defaultPresenterAppearance.videoDeviceId,
    alignment: p?.alignment ?? defaultPresenterAppearance.alignment,
    highlightActiveWord: Boolean(p?.highlightActiveWord),
    mirrorMode: Boolean(p?.mirrorMode),
    voiceCommands: Boolean(p?.voiceCommands),
    rotateScreen: Boolean(p?.rotateScreen),
    preserveFormatting: Boolean(p?.preserveFormatting),
    smoothAnimations: Boolean(p?.smoothAnimations),
    showStopSigns: Boolean(p?.showStopSigns),
    // overlays
    showOverlay: Boolean(
      p?.showOverlay ?? defaultPresenterAppearance.showOverlay,
    ),
    overlayShape: p?.overlayShape ?? defaultPresenterAppearance.overlayShape,
    overlayColor: p?.overlayColor ?? defaultPresenterAppearance.overlayColor,
    overlayOpacity:
      typeof p?.overlayOpacity === "number"
        ? p!.overlayOpacity
        : defaultPresenterAppearance.overlayOpacity,
    overlayPosX:
      typeof p?.overlayPosX === "number"
        ? p!.overlayPosX
        : defaultPresenterAppearance.overlayPosX,
    overlayPosY:
      typeof p?.overlayPosY === "number"
        ? p!.overlayPosY
        : defaultPresenterAppearance.overlayPosY,
  };
}

function findActiveDoc(docs: ScriptDoc[] | undefined, activeDocId?: string | null) {
  if (!docs?.length || !activeDocId) return null;
  return docs.find((d) => d?.id === activeDocId) ?? null;
}

function openOnScreen(opts: OpenOpts, url: string): Window | null {
  const s = opts.screen;
  const w = Math.max(320, Math.round(s.width));
  const h = Math.max(200, Math.round(s.height));
  const left = Math.round(s.left ?? 0);
  const top = Math.round(s.top ?? 0);

  const features =
    opts.features ??
    `left=${left},top=${top},width=${w},height=${h},menubar=no,toolbar=no,location=no`;

  return window.open(url, opts.windowName ?? "xteleprompter", features);
}

/**
 * Open a presenter window for the given screen and initialize it via postMessage.
 * Strategy:
 * - Immediately post init (may be missed if app not ready)
 * - Listen for "presenter-ready" and post again
 * - Fallback: post again after 700ms
 */
export function openTeleprompter(opts: OpenOpts): Window | null {
  if (!opts.screen) return null;

  const base = "/app.html";
  const url = base;
  const win = openOnScreen(opts, url);
  if (!win) return null;

  if (opts.presenterWindowRef) opts.presenterWindowRef.current = win;

  // focus best effort

  win.focus?.();

  setTimeout(() => {
    win.focus?.();
  }, 50);

  const origin = window.location.origin;
  const doc = findActiveDoc(opts.docs, opts.activeDocId);
  const appearance = normalizePresenterAppearance(opts.appearance?.presenter);

  const initMsg: PresenterInitMessage = {
    type: "presenter-init",
    docId: opts.activeDocId,
    doc,
    appearance,
  };

  const sendInit = () => {
    win.postMessage(initMsg, origin);
  };

  // attempt #1: immediate (same gesture)
  sendInit();

  // attempt #2: when presenter signals readiness
  const settled = false;

  const onMsg = (e: MessageEvent) => {
    if (e.origin !== origin) return;
    const t = e.data?.type;
    if (t !== "presenter-ready") return;

    sendInit();
    window.removeEventListener("message", onMsg);
  };

  window.addEventListener("message", onMsg);

  // attempt #3: timed fallback
  setTimeout(() => {
    if (settled) return;
    sendInit();
  }, 700);

  // Optional: explicit doc load (often redundant if initMsg includes doc)

  if (doc) win.postMessage({ type: "presenter-load-doc", doc }, origin);

  return win;
}
