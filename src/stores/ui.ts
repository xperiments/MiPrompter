import { create } from "zustand";
import { lsSetJSON } from "../lib/local-storage";
import { AppearanceSettings } from "../types";
import { APPEARANCE_STORAGE_KEY } from "../lib/keys";

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  editor: {
    width: 100,
    fontSize: 15,
  },
  presenter: {
    alignment: "center",
    mirrorMode: false,
    showStopSigns: false,
    voiceCommands: false,
    rotateScreen: false,
    preserveFormatting: false,
    smoothAnimations: false,
    highlightActiveWord: false,
    // centerline defaults
    showCenterline: true,
    activeLineGuideHeight: 2,
    fontSize: 56,
    lineSpacing: 140,
    paragraphSpacing: 0.5,
    sideMargins: 8,
    activeLinePosition: 35,
    // default font
    fontFamily: "Inter",
    // no default camera selected
    videoDeviceId: undefined,
    // overlay defaults
    showOverlay: false,
    overlayShape: "snap",
    overlayColor: "#2563eb",
    overlayOpacity: 80,
    overlayPosX: 50,
    overlayPosY: 60,
  },
};

export type UiStore = {
  contentType: "display" | "text" | "chat";
  appearance: AppearanceSettings;
  setContentType: (v: UiStore["contentType"]) => void;
  patchAppearance: (p: Partial<AppearanceSettings>) => void;
};

export const useUiStore = create<UiStore>((set: any) => ({
  contentType: "text",
  appearance: DEFAULT_APPEARANCE,
  setContentType: (v: any) => set({ contentType: v }),
  patchAppearance: (p: Partial<AppearanceSettings>) =>
    set((s: any) => {
      const next = { ...s.appearance, ...p };
      lsSetJSON(APPEARANCE_STORAGE_KEY, next);
      return { appearance: next };
    }),
}));
