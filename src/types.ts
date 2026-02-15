export type ScriptChapter = { id: string; text: string };

export type ScriptDoc = {
  id: string;
  name: string;
  chapters: ScriptChapter[];
};

// Clean, simplified appearance types
export type EditorAppearance = {
  width: number;     // chapter column width percentage
  fontSize: number;  // editor font size
};

export type PresenterAppearance = {
  alignment: 'left' | 'center' | 'right';
  mirrorMode: boolean;
  showStopSigns: boolean;
  voiceCommands: boolean;
  rotateScreen: boolean;
  preserveFormatting: boolean;
  smoothAnimations: boolean;
  highlightActiveWord: boolean;
  // Show or hide the center guide/ruler in the presenter
  showCenterline?: boolean;
  // Height of the prominent centerline in pixels
  activeLineGuideHeight?: number;
  fontSize: number;
  // Selected font-family (e.g. 'Inter') — applied in presenter
  fontFamily?: string;
  // Selected video input device id (deviceId) — undefined/null means None
  videoDeviceId?: string | null;
  lineSpacing: number;
  paragraphSpacing: number;
  sideMargins: number;
  activeLinePosition: number;  // vertical position of active line (percentage)

  // Overlay controls (UI + presenter overlay)
  showOverlay?: boolean;                       // master toggle
  overlayShape?: 'circle' | 'cross' | 'snap' | 'square';
  overlayColor?: string;                       // hex color
  overlayOpacity?: number;                     // 0-100
  overlayPosX?: number;                        // 0-100 (%) horizontal position in presenter
  overlayPosY?: number;                        // 0-100 (%) vertical position in presenter
};

export type AppearanceSettings = {
  editor?: Partial<EditorAppearance>;
  presenter?: Partial<PresenterAppearance>;
};
