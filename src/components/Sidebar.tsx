import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import QRCode from "qrcode";

import type { ScriptDoc, AppearanceSettings } from "../types";
import { SidebarSection } from "./sidebar/SidebarSection";
import { Select } from "./ui/Select";
import { SliderRow } from "./ui/SliderRow";

import { ToggleRow } from "./ui/ToggleRow";
import { ScriptList } from "./sidebar/ScriptList";
import { useUiStore } from "../stores/ui";
import { useScreenDetection } from "../hooks/useScreenDetection";
import { useMicrophoneDetection } from "../hooks/useMicrophoneDetection";
import { useCameraDetection } from "../hooks/useCameraDetection";
import { useLocalStorage } from "../hooks/useLocalStorage";
import {
  usePresenterSync,
  updatePresenterWindow,
} from "../hooks/usePresenterSync";

/* extracted sidebar subcomponents */
import ScriptsSection from "./sidebar/ScriptsSection";
import DisplaysSection from "./sidebar/DisplaysSection";
import AppearanceSection from "./sidebar/AppearanceSection";

export interface SidebarProps {
  scripts: ScriptDoc[];
  activeScriptId: string;
  onSelectScript: (id: string) => void;
  onAddScript: () => void;
  onRemoveScript: () => void;
  appearance?: AppearanceSettings;
  updateAppearance?: (patch: Partial<AppearanceSettings>) => void;
  presenterWindowRef?: React.MutableRefObject<Window | null>;
  presenterDisplayedDocRef?: React.MutableRefObject<string | null>;
  presenterDisplayedChapterRef?: React.MutableRefObject<string | null>;
  // lightweight presenter message shape
  send?: (msg: { type: string; [k: string]: unknown }) => boolean;
  /**
   * Subscribe to presenter messages forwarded by the centralized hook (`usePresenterBridge().on`).
   * Handler receives (payload, meta) where meta.transport is 'postMessage' | 'ws'.
   */
  on?: (
    type: string,
    handler: (
      payload: unknown,
      meta?: { origin: string; transport: "postMessage" | "ws" },
    ) => void,
  ) => () => void;
  // helper to open the teleprompter window when the UI needs it
  onOpenTeleprompter?: () => void;
  // controller-side presenter runtime state (passed from App)
  presenterState?:
    | {
        playing?: boolean;
        mic?: boolean;
        windowOpen?: boolean;
        wordIndex?: number;
      }
    | undefined;
  // speech / voice command config (controlled by App)
  speechLanguage?: string;
  onSpeechLanguageChange?: (lang: string) => void;
  // helpers provided by `useAppSpeechControl` for on-device packs
  checkSpeechOnDevice?: (lang: string) => Promise<string>;
  installSpeechOnDevice?: (lang: string) => Promise<boolean>;
  // convenience: read cached on-device availability for a language
  isSpeechOnDeviceAvailable?: (lang?: string) => boolean;
  voiceCommands?: {
    wakeWord: string;
    requireWakeWord?: boolean;

    retry: string;
    restart: string;
  } | null;
  setVoiceCommands?: (v: SidebarProps["voiceCommands"] | null) => void;
}

export function Sidebar(props: SidebarProps) {
  const patchAppearance = useUiStore((state) => state.patchAppearance);
  const [lastDevice, setLastDevice] = React.useState<string | null>(null);
  // Custom hooks for device management
  const screens = useScreenDetection();
  const mics = useMicrophoneDetection();
  const cams = useCameraDetection();
  const ls = useLocalStorage();

  // UI hint from presenter (transient)
  const presenterStatus = React.useState<string | null>(null)[0];

  // on-device language install UI
  const [installingLang, setInstallingLang] = React.useState(false);
  const [onDeviceStatus, setOnDeviceStatus] = React.useState<string | null>(
    null,
  );

  const handleInstallLang = React.useCallback(async () => {
    const lang = props.speechLanguage ?? "en-US";
    if (!props.checkSpeechOnDevice) {
      setOnDeviceStatus("unsupported");
      return;
    }

    setOnDeviceStatus("checking");
    try {
      const status = await props.checkSpeechOnDevice(lang);
      if (status === "available") {
        setOnDeviceStatus("available");
        setLangStatuses((s) => ({ ...(s || {}), [lang]: "available" }));
        return;
      }
      if (status === "unavailable") {
        setOnDeviceStatus("unavailable");
        setLangStatuses((s) => ({ ...(s || {}), [lang]: "unavailable" }));
        return;
      }

      // otherwise attempt install (if API present)
      if (!props.installSpeechOnDevice) {
        setOnDeviceStatus("no-install-api");
        return;
      }

      setInstallingLang(true);
      setOnDeviceStatus("installing");
      const ok = await props.installSpeechOnDevice(lang);
      setInstallingLang(false);
      setOnDeviceStatus(ok ? "installed" : "install-failed");
      setLangStatuses((s) => ({
        ...(s || {}),
        [lang]: ok ? "installed" : "install-failed",
      }));
    } catch (err) {
      setInstallingLang(false);
      setOnDeviceStatus("error");
    }
  }, [
    props.checkSpeechOnDevice,
    props.installSpeechOnDevice,
    props.speechLanguage,
  ]);

  // Allow other UI to request a sidebar section to open (used when selecting devices)
  const openSidebarSection = (title: string) => {
    window.dispatchEvent(
      new CustomEvent("smui.open-sidebar-section", { detail: { title } }),
    );
  };

  // Sync presenter with active script
  usePresenterSync({
    presenterWindowRef: props.presenterWindowRef ?? { current: null },
    send: props.send,
    activeScriptId: props.activeScriptId,
    scripts: props.scripts,
    presenterDisplayedDocRef: props.presenterDisplayedDocRef,
    presenterDisplayedChapterRef: props.presenterDisplayedChapterRef,
  });

  // Memoize presenter config from localStorage
  const presenter = useMemo(() => {
    const stored = ls.getJSON<Record<string, any>>("smui.appearance.v1", null);
    if (stored) return stored.presenter || {};
    return props.appearance?.presenter || {};
  }, [props.appearance, ls]);

  // Local preview state for sliders that need immediate, optimistic feedback
  // (avoids relying on props.appearance update + localStorage during drag).
  const [presenterPreview, setPresenterPreview] = React.useState<Partial<
    typeof presenter
  > | null>(null);

  // Visual-only Cast QR (Sidebar) — points to app.html (WS transport) with a random token
  const [castQrUrl] = React.useState(
    () =>
      `${location.origin}/app.html?transport=ws&rnd=${Math.floor(Math.random() * 1e9)}`,
  );
  const [castQrDataUrl, setCastQrDataUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    QRCode.toDataURL(castQrUrl, { margin: 1, width: 220 })
      .then(setCastQrDataUrl)
      .catch(() => setCastQrDataUrl(null));
  }, [castQrUrl]);

  // If the authoritative presenter props change (external update), clear preview
  React.useEffect(() => {
    if (!presenterPreview) return;

    // clear preview when the real presenter value diverges (commit happened elsewhere)
    const previewHeight = presenterPreview.activeLineGuideHeight;
    if (previewHeight != null) {
      if ((presenter.activeLineGuideHeight ?? 2) === previewHeight) {
        setPresenterPreview(null);
        return;
      }
    }

    // clear overlay preview when persisted values match the preview
    const px = presenterPreview.overlayPosX;
    const py = presenterPreview.overlayPosY;
    if (typeof px === "number" && typeof py === "number") {
      if (
        (presenter.overlayPosX ?? 50) === px &&
        (presenter.overlayPosY ?? 60) === py
      ) {
        setPresenterPreview(null);
        return;
      }
    }
  }, [presenter, presenterPreview]);

  // Update appearance helper
  const updatePresenterAppearance = useCallback(
    (updates: Partial<typeof presenter>) => {
      const newPresenter = { ...presenter, ...updates };

      if (props.updateAppearance) {
        props.updateAppearance({ presenter: newPresenter });
      }

      patchAppearance({ presenter: newPresenter });

      if (props.presenterWindowRef) {
        updatePresenterWindow(props.presenterWindowRef, updates);
      }
    },
    [presenter, props, patchAppearance],
  );

  // Screen selection logic extracted from inline JSX — kept here to preserve
  // access to local state (`lastDevice`) and to avoid changing effects/refs.
  const handleSelectScreen = React.useCallback(
    (id: string) => {
      try {
        screens.setSelectedScreenLabel(id);

        const screenInfo =
          screens?.screens.find((s) => s.label === id) || screens?.screens?.[0];
        const win = props.presenterWindowRef?.current;

        if (!win || win.closed) {
          props.onOpenTeleprompter?.();
          setLastDevice(id);
          return;
        }

        if (lastDevice === id) {
          if (!win.document.fullscreenElement) win.focus?.();
          return;
        }

        if (win && !win.closed && screenInfo) {
          win.resizeTo(400, 300);
          setTimeout(() => {
            win.moveTo(screenInfo.left, screenInfo.top);
            setTimeout(() => {
              win.resizeTo(screenInfo.width, screenInfo.height);
              setTimeout(() => {
                win.focus?.();
                props.send?.({
                  type: "hold-for-enter",
                  screen: screenInfo,
                  rotate: Boolean(presenter?.rotateScreen),
                });
              }, 500);
              setLastDevice(id);
            }, 500);
          }, 500);
        }
      } catch (err) {
        console.warn("[Sidebar] handleSelectScreen failed", err);
      }
    },
    [
      screens,
      props.presenterWindowRef,
      props.onOpenTeleprompter,
      lastDevice,
      presenter,
    ],
  );

  // Persist & propagate voice-command changes (called by the inputs below)
  const handleVoiceCommandsChange = React.useCallback(
    (patch: Partial<NonNullable<SidebarProps["voiceCommands"]>>) => {
      const next = { ...(props.voiceCommands ?? {}), ...patch };
      props.setVoiceCommands?.(next);

      ls.setJSON("smui.voiceCommands.v1", next);

      // Notify presenter window (non-fatal)
      props.send?.({ type: "presenter-voice-commands", config: next });
    },
    [props.setVoiceCommands, props.voiceCommands, props.presenterWindowRef, ls],
  );

  // language options shared between the Select and the status list
  const LANG_OPTIONS = [
    // English (375M+ speakers)
    { value: "en-US", label: "English (US)" },
    { value: "en-GB", label: "English (UK)" },
    { value: "en-AU", label: "English (Australia)" },
    { value: "en-CA", label: "English (Canada)" },
    { value: "en-IN", label: "English (India)" },
    { value: "en-NZ", label: "English (New Zealand)" },
    { value: "en-IE", label: "English (Ireland)" },
    { value: "en-SG", label: "English (Singapore)" },
    { value: "en-ZA", label: "English (South Africa)" },
    { value: "en-PH", label: "English (Philippines)" },

    // Spanish (500M+ speakers)
    { value: "es-ES", label: "Español (España)" },
    { value: "es-MX", label: "Español (México)" },
    { value: "es-AR", label: "Español (Argentina)" },
    { value: "es-CO", label: "Español (Colombia)" },
    { value: "es-PE", label: "Español (Perú)" },
    { value: "es-VE", label: "Español (Venezuela)" },
    { value: "es-CL", label: "Español (Chile)" },
    { value: "es-US", label: "Español (USA)" },
    { value: "es-EC", label: "Español (Ecuador)" },
    { value: "es-BO", label: "Español (Bolivia)" },
    { value: "es-DO", label: "Español (Rep. Dominicana)" },
    { value: "es-GT", label: "Español (Guatemala)" },
    { value: "es-HN", label: "Español (Honduras)" },
    { value: "es-NI", label: "Español (Nicaragua)" },
    { value: "es-PA", label: "Español (Panamá)" },
    { value: "es-PR", label: "Español (Puerto Rico)" },
    { value: "es-PY", label: "Español (Paraguay)" },
    { value: "es-SV", label: "Español (El Salvador)" },
    { value: "es-UY", label: "Español (Uruguay)" },
    { value: "es-CR", label: "Español (Costa Rica)" },

    // Mandarin Chinese (918M+ speakers)
    { value: "zh-CN", label: "中文 (简体)" },
    { value: "zh-TW", label: "中文 (繁體)" },

    // Hindi (345M+ speakers)
    { value: "hi-IN", label: "हिन्दी (India)" },

    // French (280M+ speakers)
    { value: "fr-FR", label: "Français (France)" },
    { value: "fr-CA", label: "Français (Canada)" },
    { value: "fr-BE", label: "Français (Belgique)" },
    { value: "fr-CH", label: "Français (Suisse)" },
    { value: "fr-LU", label: "Français (Luxembourg)" },

    // Portuguese (252M+ speakers)
    { value: "pt-BR", label: "Português (Brasil)" },
    { value: "pt-PT", label: "Português (Portugal)" },
    { value: "pt-AO", label: "Português (Angola)" },
    { value: "pt-MZ", label: "Português (Moçambique)" },

    // German (131M+ speakers)
    { value: "de-DE", label: "Deutsch (Deutschland)" },
    { value: "de-AT", label: "Deutsch (Österreich)" },
    { value: "de-CH", label: "Deutsch (Schweiz)" },
    { value: "de-LU", label: "Deutsch (Luxemburg)" },
    { value: "de-LI", label: "Deutsch (Liechtenstein)" },

    // Japanese (125M+ speakers)
    { value: "ja-JP", label: "日本語 (日本)" },

    // Korean (82M+ speakers)
    { value: "ko-KR", label: "한국어 (대한민국)" },

    // Italian (85M+ speakers)
    { value: "it-IT", label: "Italiano (Italia)" },
    { value: "it-CH", label: "Italiano (Svizzera)" },

    // Russian (162M+ speakers)
    { value: "ru-RU", label: "Русский (Россия)" },

    // Vietnamese (85M+ speakers)
    { value: "vi-VN", label: "Tiếng Việt (Việt Nam)" },

    // Turkish (88M+ speakers)
    { value: "tr-TR", label: "Türkçe (Türkiye)" },

    // Indonesian (43M+ speakers)
    { value: "id-ID", label: "Bahasa Indonesia" },

    // Polish (45M+ speakers)
    { value: "pl-PL", label: "Polski (Polska)" },

    // Thai (60M+ speakers)
    { value: "th-TH", label: "ไทย (ประเทศไทย)" },
  ];

  const [langStatuses, setLangStatuses] = React.useState<
    Record<string, string>
  >({});

  // options prefixed with online/offline icons (📵 = offline, ☁️ = online)
  const LANG_OPTIONS_WITH_ICONS = React.useMemo(() => {
    return LANG_OPTIONS.map((opt) => {
      const s = langStatuses[opt.value];
      const offline = s === "available" || s === "installed";
      const icon = offline ? "📵" : "☁️";
      return { ...opt, label: `${icon} ${opt.label}` };
    });
  }, [langStatuses]);

  // helper for the currently selected language
  const selectedLang = props.speechLanguage ?? "es-ES";
  const selectedLangStatus = langStatuses[selectedLang];
  const selectedLangIsInstalled =
    selectedLangStatus === "available" || selectedLangStatus === "installed";

  // reset on-device status when the user picks a different language
  React.useEffect(() => {
    setOnDeviceStatus(null);
  }, [selectedLang]);

  // populate per-language on-device availability (calls checkSpeechOnDevice in parallel)
  React.useEffect(() => {
    let mounted = true;
    const checkAll = async () => {
      if (!props.checkSpeechOnDevice) return;
      const entries = await Promise.all(
        LANG_OPTIONS.map(async (opt) => {
          try {
            const s = await props.checkSpeechOnDevice!(opt.value);
            return [opt.value, String(s)] as const;
          } catch (_) {
            return [opt.value, "error"] as const;
          }
        }),
      );
      if (!mounted) return;
      const next: Record<string, string> = {};
      for (const [k, v] of entries) next[k] = v as string;
      setLangStatuses(next);
    };
    checkAll();
    return () => {
      mounted = false;
    };
  }, [props.checkSpeechOnDevice]);

  // Export scripts handler
  const handleExportScripts = useCallback(async () => {
    try {
      const raw = ls.getRaw("smui.scripts.v1") ?? "[]";
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scripts.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export scripts");
    }
  }, [ls]);

  // Import scripts handler
  const handleImportScripts = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;

      try {
        const txt = await f.text();
        const parsed = JSON.parse(txt) as ScriptDoc[];
        if (!Array.isArray(parsed)) throw new Error("Invalid script file");

        ls.setJSON("smui.scripts.v1", parsed);

        const { idbSet } = await import("../lib/db");
        await idbSet("smui.scripts.v1", parsed);

        window.location.reload();
      } catch {
        alert("Invalid script file");
      }
    },
    [ls],
  );

  // Appearance change handlers
  const handleAlignmentChange = useCallback(
    (v: string) => {
      const newVal = v as "left" | "center" | "right";
      updatePresenterAppearance({ alignment: newVal });
    },
    [updatePresenterAppearance],
  );

  const handleToggle = useCallback(
    (key: keyof typeof presenter) => (value: boolean) => {
      updatePresenterAppearance({ [key]: value });
    },
    [updatePresenterAppearance],
  );

  const handleSliderChange = useCallback(
    (key: keyof typeof presenter) => (value: number) => {
      updatePresenterAppearance({ [key]: value });
    },
    [updatePresenterAppearance],
  );

  // Notify presenter about mic changes
  const prevMicIdRef = React.useRef(mics.selectedMicId);
  React.useEffect(() => {
    if (prevMicIdRef.current !== mics.selectedMicId) {
      prevMicIdRef.current = mics.selectedMicId;
      updatePresenterAppearance({ micDeviceId: mics.selectedMicId });
    }
  }, [mics.selectedMicId]);

  return (
    <div className="h-full overflow-auto overflow-x-hidden">
      {/* Scripts Section (extracted) */}
      <ScriptsSection
        scripts={props.scripts}
        activeScriptId={props.activeScriptId}
        onSelectScript={props.onSelectScript}
        onAddScript={props.onAddScript}
        onRemoveScript={props.onRemoveScript}
        onExport={handleExportScripts}
        onImport={handleImportScripts}
      />


      {/* Appearance + Display Options (extracted) */}
      <AppearanceSection
        presenter={presenter}
        presenterPreview={presenterPreview}
        setPresenterPreview={setPresenterPreview}
        handleAlignmentChange={handleAlignmentChange}
        handleSliderChange={handleSliderChange}
        handleToggle={handleToggle}
        updatePresenterAppearance={updatePresenterAppearance}
        presenterWindowRef={props.presenterWindowRef}
      />

      {/* Voice Commands (new) */}
      <SidebarSection title="Speech" icon="microphone">
        <div className="space-y-3 px-1">
          <div className="text-xs text-white/55 mb-2">Microphones</div>

          <div className="flex items-center gap-2">
            <div
              className="flex-1"
              onMouseDown={() => {
                if (mics?.permission === "prompt") mics.requestPermission();
              }}
            >
              {mics ? (
                <MicrophoneSelect
                  mics={mics.mics}
                  selected={mics.selectedMicId}
                  onChange={mics.setSelectedMicId}
                  loading={mics.loading}
                  error={mics.error}
                  onRefresh={mics.refresh}
                />
              ) : (
                <ScriptList
                  items={[{ id: "", label: "Microphones unavailable" }]}
                  activeId={""}
                  onSelect={() => {}}
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/40">
              Permission:{" "}
              <strong
                style={{
                  color:
                    mics.permission === "granted"
                      ? "#34d399"
                      : mics.permission === "denied"
                        ? "#ef4444"
                        : "#9ca3af",
                }}
              >
                {mics.permission}
              </strong>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-1 mt-8">
          <ToggleRow
            label="Voice Commands"
            description='Say "prompter restart" to reset'
            checked={presenter.voiceCommands ?? false}
            onChange={handleToggle("voiceCommands")}
          />
          <Row label="Language">
            {/* language options reused below for status checks */}
            {/**/}
            <div className="flex items-center gap-3">
              <div style={{ flex: 1 }}>
                <Select
                  value={props.speechLanguage ?? "es-ES"}
                  onChange={(v) => props.onSpeechLanguageChange?.(v)}
                  options={LANG_OPTIONS_WITH_ICONS}
                />
              </div>
            </div>
          </Row>

          {!selectedLangIsInstalled && (
            <>
              <Row label="">
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm bg-white/5 border border-white/10 rounded-md px-2 py-1"
                    onClick={handleInstallLang}
                    disabled={!props.checkSpeechOnDevice || installingLang}
                    title={
                      !props.checkSpeechOnDevice
                        ? "Not supported by this browser"
                        : "Check/install on-device language pack"
                    }
                  >
                    {installingLang ? "Installing…" : "Install Offline Pack"}
                  </button>

                  <div className="text-xs text-white/50">
                    {onDeviceStatus === "checking" && "Checking…"}
                    {onDeviceStatus === "available" && "Ready"}
                    {onDeviceStatus === "installed" && "Installed"}
                    {onDeviceStatus === "installing" && "Installing…"}
                    {onDeviceStatus === "install-failed" && "Failed"}
                    {onDeviceStatus === "unavailable" && "Unavailable"}
                    {onDeviceStatus === "unsupported" && "Unsupported"}
                    {onDeviceStatus === "no-install-api" && "No API"}
                    {onDeviceStatus === "error" && "Error"}
                  </div>
                </div>
              </Row>
            </>
          )}
          <Row label="Prompter name">
            <input
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white/80"
              value={props.voiceCommands?.wakeWord ?? ""}
              onChange={(e) =>
                handleVoiceCommandsChange({ wakeWord: e.target.value })
              }
              placeholder="e.g. Siri"
            />
          </Row>

          <Row label="Retry (current chapter)">
            <input
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white/80"
              value={props.voiceCommands?.retry ?? "retry"}
              onChange={(e) =>
                handleVoiceCommandsChange({ retry: e.target.value })
              }
            />
          </Row>

          <Row label="Restart (document)">
            <input
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white/80"
              value={props.voiceCommands?.restart ?? "restart"}
              onChange={(e) =>
                handleVoiceCommandsChange({ restart: e.target.value })
              }
            />
          </Row>

          <div className="text-xs text-white/40">
            Say the configured phrase prefixed by the{" "}
            <strong>Prompter name</strong> (e.g. <code>Siri Retry</code> or{" "}
            <code>Siri Restart</code>).
          </div>
        </div>
      </SidebarSection>

      {/* Video Source (new) */}
      <SidebarSection title="Video Inputs" icon="movie">
        <div className="space-y-3 px-1">
          <div className="text-xs text-white/55 mb-2">Input Sources</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="flex-1">
              <ScriptList
                items={[
                  { id: "", label: "None" },
                  ...cams.cameras.map((c) => ({
                    id: c.deviceId,
                    label: c.label,
                  })),
                ]}
                activeId={
                  presenterPreview?.videoDeviceId ??
                  presenter.videoDeviceId ??
                  ""
                }
                onSelect={(id) => {
                  const v = id;
                  const next = v || undefined;

                  // surface Display Options when the user picks a camera
                  openSidebarSection("Display Options");

                  // optimistic preview + immediate presenter update (fast-path)
                  setPresenterPreview((p) => ({
                    ...(p || {}),
                    videoDeviceId: next,
                  }));
                  if (props.presenterWindowRef)
                    updatePresenterWindow(props.presenterWindowRef, {
                      videoDeviceId: next,
                      ...(next
                        ? { showOverlay: true, overlayShape: "camera" }
                        : {}),
                    });

                  cams.setSelectedCameraId(v || null);

                  // persist + enable overlay when selecting a camera
                  updatePresenterAppearance({
                    videoDeviceId: next,
                    ...(next
                      ? { showOverlay: true, overlayShape: "camera" }
                      : {}),
                  });
                }}
                onRefresh={cams.refresh}
              />
            </div>
          </div>

          <div className="text-xs text-white/40">
            Permission:{" "}
            <strong
              style={{
                color:
                  cams.permission === "granted"
                    ? "#34d399"
                    : cams.permission === "denied"
                      ? "#ef4444"
                      : "#9ca3af",
              }}
            >
              {cams.permission}
            </strong>
          </div>
        </div>
      </SidebarSection>

      {/* Overlays (new) */}
      <SidebarSection title="Overlays" icon="layers">
        <div className="space-y-3 px-0">
          <ToggleRow
            label="Show Overlay"
            description="Render a small overlay (camera / badge) on the presenter"
            checked={presenter.showOverlay ?? false}
            onChange={(v) => updatePresenterAppearance({ showOverlay: v })}
          />

          <Row label="Shape">
            <Select
              value={presenter.overlayShape ?? "snap"}
              onChange={(v) =>
                updatePresenterAppearance({ overlayShape: v as string })
              }
              options={[
                { value: "camera", label: "Camera" },
                { value: "circle", label: "Circle" },
                { value: "cross", label: "Cross" },
                { value: "snap", label: "Snap" },
                { value: "square", label: "Square" },
              ]}
            />
          </Row>

          <Row label="Color">
            <input
              aria-label="Overlay color"
              type="color"
              value={presenter.overlayColor ?? "#2563eb"}
              onChange={(e) =>
                updatePresenterAppearance({ overlayColor: e.target.value })
              }
              className="w-12 h-8 p-0 border border-white/8 bg-white/3 rounded-md"
            />
          </Row>

          <SliderRow
            label="Opacity"
            value={presenter.overlayOpacity ?? 80}
            onChange={(v) => updatePresenterAppearance({ overlayOpacity: v })}
            unit="%"
            min={0}
            max={100}
          />

          <Row label="Position">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 160 }}>
                <div
                  className="rounded-md bg-black/60 border border-white/6 p-2 relative"
                  style={{ height: 96, userSelect: "none" }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <PositionPreview
                    shape={
                      presenterPreview?.overlayShape ??
                      presenter.overlayShape ??
                      "snap"
                    }
                    color={
                      presenterPreview?.overlayColor ??
                      presenter.overlayColor ??
                      "#2563eb"
                    }
                    opacity={
                      (presenterPreview?.overlayOpacity ??
                        presenter.overlayOpacity ??
                        80) / 100
                    }
                    x={
                      ((presenterPreview?.overlayPosX ??
                        presenter.overlayPosX ??
                        50) as number) / 100
                    }
                    y={
                      ((presenterPreview?.overlayPosY ??
                        presenter.overlayPosY ??
                        60) as number) / 100
                    }
                    onChange={(nx, ny) => {
                      const px = Math.round(nx * 100);
                      const py = Math.round(ny * 100);
                      // optimistic local preview for instant feedback during drag
                      setPresenterPreview((p) => ({
                        ...(p || {}),
                        overlayPosX: px,
                        overlayPosY: py,
                      }));
                      // persist + notify presenter for live update
                      updatePresenterAppearance({
                        overlayPosX: px,
                        overlayPosY: py,
                      });
                    }}
                  />
                </div>
              </div>

              {/* Reset position button */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <button
                  title="Center overlay"
                  aria-label="Center overlay position"
                  onClick={() => {
                    setPresenterPreview(null);
                    updatePresenterAppearance({
                      overlayPosX: 50,
                      overlayPosY: 50,
                    });
                  }}
                  className={`w-9 h-9 rounded-md bg-white/3 hover:bg-white/5 border border-white/6 text-white/80 grid place-items-center`}
                  disabled={
                    (presenterPreview?.overlayPosX ??
                      presenter.overlayPosX ??
                      50) === 50 &&
                    (presenterPreview?.overlayPosY ??
                      presenter.overlayPosY ??
                      60) === 50
                  }
                >
                  ↺
                </button>
              </div>
            </div>
          </Row>

          <div className="text-xs text-white/40">
            Position is relative to the presenter viewport; drag the badge to
            move it.
          </div>
        </div>
      </SidebarSection>



      {/* Cast (visual-only QR) */}
      <SidebarSection title="Mobile Viewer" icon="phone" forceOpen={true}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="flex-1">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 160,
                  height: 160,
                  background: "white",
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                {castQrDataUrl ? (
                  <img
                    src={castQrDataUrl}
                    alt="presenter-qr"
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      color: "#666",
                    }}
                  >
                    QR
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-white/55 mt-2">
              On phone/tablet → scan QR
            </div>
          </div>
        </div>
      </SidebarSection>

      <div className="h-10" />
    </div>
  );
}

// Helper components
function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3">
      <div className="text-xs text-white/55">{props.label}</div>
      <div>{props.children}</div>
    </div>
  );
}

// Simple, reliable position preview — click or drag anywhere in the box to set position.
function PositionPreview(props: {
  shape: string;
  color: string;
  opacity: number;
  x: number;
  y: number;
  onChange: (nx: number, ny: number) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);

  React.useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    // prevent native gestures from interfering
    c.style.touchAction = "none";
    c.style.userSelect = "none";

    function clamp(v: number) {
      return Math.max(0, Math.min(1, v));
    }

    function pointToLocal(e: PointerEvent | MouseEvent | TouchEvent) {
      const rect = c!.getBoundingClientRect();
      // normalize touch vs mouse/pointer events without `any`
      if (
        typeof (e as TouchEvent).touches !== "undefined" &&
        (e as TouchEvent).touches.length
      ) {
        const t = (e as TouchEvent).touches[0];
        return {
          x: clamp((t.clientX - rect.left) / rect.width),
          y: clamp((t.clientY - rect.top) / rect.height),
        };
      }
      const mouseLike = e as MouseEvent | PointerEvent;
      if (typeof mouseLike.clientX !== "number") return { x: 0.5, y: 0.5 };
      return {
        x: clamp((mouseLike.clientX - rect.left) / rect.width),
        y: clamp((mouseLike.clientY - rect.top) / rect.height),
      };
    }

    function onPointerDown(e: PointerEvent) {
      if (e instanceof MouseEvent && e.button !== 0) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      draggingRef.current = true;
      const p = pointToLocal(e);
      props.onChange(p.x, p.y);
    }

    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const p = pointToLocal(e);
      props.onChange(p.x, p.y);
    }

    function onPointerUp(e: PointerEvent) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      draggingRef.current = false;
    }

    function onClick(e: MouseEvent) {
      const p = pointToLocal(e);
      props.onChange(p.x, p.y);
    }

    c.addEventListener(
      "pointerdown",
      onPointerDown as EventListener,
      { passive: false } as AddEventListenerOptions,
    );
    window.addEventListener(
      "pointermove",
      onPointerMove as EventListener,
      { passive: false } as AddEventListenerOptions,
    );
    window.addEventListener("pointerup", onPointerUp as EventListener);
    c.addEventListener("click", onClick as EventListener);

    return () => {
      c.removeEventListener("pointerdown", onPointerDown as EventListener);
      window.removeEventListener("pointermove", onPointerMove as EventListener);
      window.removeEventListener("pointerup", onPointerUp as EventListener);
      c.removeEventListener("click", onClick as EventListener);

      c.style.touchAction = "";
      c.style.userSelect = "";
    };
  }, [props.onChange]);

  // keyboard nudging
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      const step = e.shiftKey ? 0.05 : 0.01;
      let handled = false;
      let nx = props.x;
      let ny = props.y;
      if (e.key === "ArrowLeft") {
        nx = Math.max(0, nx - step);
        handled = true;
      }
      if (e.key === "ArrowRight") {
        nx = Math.min(1, nx + step);
        handled = true;
      }
      if (e.key === "ArrowUp") {
        ny = Math.max(0, ny - step);
        handled = true;
      }
      if (e.key === "ArrowDown") {
        ny = Math.min(1, ny + step);
        handled = true;
      }
      if (handled) {
        e.preventDefault();
        props.onChange(Number(nx.toFixed(3)), Number(ny.toFixed(3)));
      }
    }
    el.addEventListener("keydown", onKey as EventListener);
    return () => el.removeEventListener("keydown", onKey as EventListener);
  }, [props.x, props.y, props.onChange]);

  const handleStyle: React.CSSProperties = {
    position: "absolute",
    left: `${props.x * 100}%`,
    top: `${props.y * 100}%`,
    transform: "translate(-50%,-50%)",
    pointerEvents: "none",
  };

  const shapeEl = (size: number) => {
    const common: React.CSSProperties = {
      width: size,
      height: size,
      background: props.color,
      opacity: props.opacity,
      display: "grid",
      placeItems: "center",
      color: "white",
    };
    switch (props.shape) {
      case "circle":
        return <div style={{ borderRadius: "50%", ...common }} />;
      case "square":
        return <div style={{ borderRadius: 6, ...common }} />;
      case "cross":
        return (
          <div style={{ borderRadius: 6, ...common, fontSize: 12 }}>✚</div>
        );
      case "camera":
        return null;
      default:
        return (
          <div
            style={{
              borderRadius: 12,
              padding: 6,
              background: props.color,
              opacity: props.opacity,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: 18,
                height: 12,
                borderRadius: 6,
                background: "rgba(255,255,255,0.12)",
              }}
            />
          </div>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="Overlay position preview"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: "1px dashed rgba(255,255,255,0.03)",
          borderRadius: 6,
        }}
      />
      <div style={handleStyle} aria-hidden>
        {shapeEl(38)}
      </div>
    </div>
  );
}

function MicrophoneSelect(props: {
  mics: Array<{ deviceId: string; label: string }>;
  selected: string | null;
  onChange: (deviceId: string) => void;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
}) {
  const { mics, selected, loading, error, onRefresh } = props;

  const items = useMemo(() => {
    if (mics.length)
      return mics.map((m) => ({
        id: m.deviceId,
        label: m.label.replace(/\s*\([^)]*\)$/, ""),
      }));
    if (selected)
      return [{ id: selected, label: `Selected — ${selected.slice(0, 6)}` }];
    return [
      {
        id: "",
        label: loading ? "Detecting…" : (error ?? "No microphones found"),
      },
    ];
  }, [mics, selected, loading, error]);

  return (
    <ScriptList
      items={items}
      activeId={selected ?? ""}
      onSelect={(id) => {
        props.onChange(id);
        window.dispatchEvent(
          new CustomEvent("smui.open-sidebar-section", {
            detail: { title: "Display Options" },
          }),
        );
      }}
      onRefresh={onRefresh}
    />
  );
}
