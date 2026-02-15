import React from "react";
import { SidebarSection } from "../sidebar/SidebarSection";
import { ToggleRow } from "../ui/ToggleRow";
import { Select } from "../ui/Select";
import { Toggle } from "../ui/Toggle";
import { LANG_OPTIONS } from "../../lib/lang-options";
import Row from "./Row";
import MicrophoneSelect from "./MicrophoneSelect";
import { useMicrophoneDetection } from "../../hooks/useMicrophoneDetection";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { VOICE_COMMANDS_KEY } from "../../lib/keys";

import type { PresenterAppearance } from "../../types";

interface Props {
  presenter: Partial<PresenterAppearance>;
  handleToggle: (key: keyof PresenterAppearance) => (v: boolean) => void;
  voiceCommands?: {
    wakeWord: string;
    requireWakeWord: boolean;
    retry: string;
    restart: string;
  } | null;
  setVoiceCommands?: React.Dispatch<React.SetStateAction<NonNullable<Props['voiceCommands']>>>;
  speechLanguage?: string;
  onSpeechLanguageChange?: (lang: string) => void;
  checkSpeechOnDevice?: (lang: string) => Promise<string>;
  installSpeechOnDevice?: (lang: string) => Promise<boolean>;
  send?: (msg: { type: string; [k: string]: unknown }) => boolean;
}

export default function VoiceCommandsSection(props: Props) {
  const mics = useMicrophoneDetection();
  const ls = useLocalStorage();

  const [installingLang, setInstallingLang] = React.useState(false);
  const [onDeviceStatus, setOnDeviceStatus] = React.useState<string | null>(null);
  const [langStatuses, setLangStatuses] = React.useState<Record<string, string>>({});

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

      if (!props.installSpeechOnDevice) {
        setOnDeviceStatus("no-install-api");
        return;
      }

      setInstallingLang(true);
      setOnDeviceStatus("installing");
      const ok = await props.installSpeechOnDevice(lang);
      setInstallingLang(false);
      setOnDeviceStatus(ok ? "installed" : "install-failed");
      setLangStatuses((s) => ({ ...(s || {}), [lang]: ok ? "installed" : "install-failed" }));
    } catch (err) {
      setInstallingLang(false);
      setOnDeviceStatus("error");
    }
  }, [props.checkSpeechOnDevice, props.installSpeechOnDevice, props.speechLanguage]);

  React.useEffect(() => {
    setOnDeviceStatus(null);
  }, [props.speechLanguage]);

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

  const handleVoiceCommandsChange = React.useCallback(
    (patch: Partial<NonNullable<Props['voiceCommands']>>) => {
      const next = { ...(props.voiceCommands ?? {}), ...patch } as NonNullable<Props['voiceCommands']>;
      props.setVoiceCommands?.(next);

      ls.setJSON(VOICE_COMMANDS_KEY, next);

      props.send?.({ type: "presenter-voice-commands", config: next });
    },
    [props.setVoiceCommands, props.voiceCommands, props.send, ls],
  );

  const selectedLang = props.speechLanguage ?? "es-ES";
  const selectedLangStatus = langStatuses[selectedLang];
  const selectedLangIsInstalled = selectedLangStatus === "available" || selectedLangStatus === "installed";

  const LANG_OPTIONS_WITH_ICONS = React.useMemo(() => {
    return LANG_OPTIONS.map((opt) => {
      const s = langStatuses[opt.value];
      const offline = s === "available" || s === "installed";
      const icon = offline ? "📵" : "☁️";
      return { ...opt, label: `${icon} ${opt.label}` };
    });
  }, [langStatuses]);

  return (
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
              <div>Microphones unavailable</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-white/40">
            Permission: <strong style={{ color: mics.permission === "granted" ? "#34d399" : mics.permission === "denied" ? "#ef4444" : "#9ca3af" }}>{mics.permission}</strong>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-1 mt-8">
        <ToggleRow
          label="Voice Commands"
          description='Say "prompter restart" to reset'
          checked={props.presenter.voiceCommands ?? false}
          onChange={props.handleToggle("voiceCommands")}
        />
        <Row label="Language">
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
                  title={!props.checkSpeechOnDevice ? "Not supported by this browser" : "Check/install on-device language pack"}
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
            onChange={(e) => handleVoiceCommandsChange({ wakeWord: e.target.value })}
            placeholder="e.g. Siri"
          />
        </Row>

        <Row label="Retry (current chapter)">
          <input
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white/80"
            value={props.voiceCommands?.retry ?? "retry"}
            onChange={(e) => handleVoiceCommandsChange({ retry: e.target.value })}
          />
        </Row>

        <Row label="Restart (document)">
          <input
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white/80"
            value={props.voiceCommands?.restart ?? "restart"}
            onChange={(e) => handleVoiceCommandsChange({ restart: e.target.value })}
          />
        </Row>

        <div className="text-xs text-white/40">
          Say the configured phrase prefixed by the <strong>Prompter name</strong> (e.g. <code>Siri Retry</code> or <code>Siri Restart</code>).
        </div>
      </div>
    </SidebarSection>
  );
}
