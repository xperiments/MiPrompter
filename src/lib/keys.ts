// Centralized storage keys and small helpers for constructing keys used across the app.
export const CAM_STORAGE_KEY = "smui.video.input";
export const MIC_STORAGE_KEY = "smui.audio.input";
export const SCREEN_STORAGE_KEY = "smui.presenter.targetScreen";
export const APPEARANCE_STORAGE_KEY = "smui.appearance.v1";
export const SCRIPTS_STORAGE_KEY = "smui.scripts.v1";
export const INITIAL_PERMISSIONS_KEY = "smui.initialPermissionsRequested";
export const FORCE_SHOW_PERMISSION_OVERLAY = "smui.forceShowPermissionOverlay";
export const PRESENTER_PAIR_ID = "smui.presenterPairId";
export const VOICE_COMMANDS_KEY = "smui.voiceCommands.v1";
export const SPEECH_LANGUAGE_KEY = "smui.speechLanguage.v1";

// Centralized event names (use these instead of hard-coded strings)
export const EVT_PERMISSIONS_UPDATED = "smui.permissions-updated";
export const EVT_OPEN_SIDEBAR_SECTION = "smui.open-sidebar-section";
export const EVT_REQUEST_PAIRED_DEVICES = "smui.request-paired-devices";
export const EVT_PAIRED_DEVICES = "smui.paired-devices";
export const EVT_COMPOSER_STREAM = "smui.composer-stream";
export const EVT_WS_READY = "smui.ws-ready";
export const EVT_SW_UPDATE_AVAILABLE = "smui.sw-update-available";
export const EVT_INSTALL_PROMPT_AVAILABLE = "smui.install-prompt-available";
export const EVT_APP_INSTALLED = "smui.app-installed";
export const EVT_OPEN_REMOTE_DEVICE = "smui.open-remote-device";

// Event prefixes / helpers
export const SMUI_PREFIX = "smui.";
export function sidebarSectionKey(id: string) {
  return `smui.sidebar.${encodeURIComponent(id)}.open`;
}
