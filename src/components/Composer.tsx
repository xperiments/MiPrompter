import React, { useEffect, useMemo, useRef, useState } from "react";
import { useScreenDetection } from "../hooks/useScreenDetection";
import {
  useCameraDetection,
  type CameraInfo,
} from "../hooks/useCameraDetection";
import { usePresenterBridge } from "../hooks/usePresenterBridge";
import { useScripts } from "../hooks/useScripts";
import { useUiStore } from "../stores/ui";
import type { ScreenInfo } from "../lib/presenter";
import Icon from "./Icon";
import DisplaysPicker from "./DisplaysPicker";
import VideoSourcesStrip from "./VideoSourcesStrip";
import StagePreview from "./StagePreview";

type VideoSourceKind = "camera" | "screen";
type VideoSource = {
  id: string; // prefixed id (cam:..., screen:...)
  kind: VideoSourceKind;
  label: string;
  available: boolean;
  raw: CameraInfo | ScreenInfo;
};

type StagePlacedSource = {
  sourceId: string; // VideoSource.id
  kind: VideoSourceKind;
  label: string;
};

type PairedDevice = {
  id: string;
  label?: string;
  ua?: string;
  screen?: { width?: number; height?: number };
  createdAt?: number;
  lastSeen?: number;
};

// Hook: fit a target rect into a container (returns rendered size + scale)
function useFitRect(
  containerRef: React.RefObject<HTMLElement>,
  targetW: number,
  targetH: number,
) {
  const [container, setContainer] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainer({ w: Math.max(0, r.width), h: Math.max(0, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const result = useMemo(() => {
    const cw = container.w || 1;
    const ch = container.h || 1;
    const tw = targetW || 16;
    const th = targetH || 9;

    console.debug("useFitRect", {
      container: { w: cw, h: ch },
      target: { w: tw, h: th },
    });
    // fit-to-box (may scale up)
    const scale = Math.min(cw / tw, ch / th) || 1;
    const renderedWidth = Math.max(1, Math.round(tw * scale));
    const renderedHeight = Math.max(1, Math.round(th * scale));
    return { renderedWidth, renderedHeight, scale };
  }, [container, targetW, targetH]);

  return result;
}

export default function Composer() {
  const screens = useScreenDetection();
  const cams = useCameraDetection();
  const { presenterWindowRef, openPresenter, send } = usePresenterBridge();

  // get app state needed when opening presenter so it receives doc + appearance
  const { docs, activeDocId } = useScripts();
  const appearance = useUiStore((s) => s.appearance);

  // selectedDisplayId is the ScreenInfo.id for the selected screen in this view
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(
    null,
  );
  const [lastSelectedDisplay, setLastSelectedDisplay] = useState<string | null>(
    null,
  );

  // paired / remote devices (received from PairedDeviceList)
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as PairedDevice[] | undefined;
      console.debug(
        "Composer: smui.paired-devices event",
        Array.isArray(detail) ? detail.map((d) => d.id) : detail,
      );
      setPairedDevices(Array.isArray(detail) ? detail : []);
    };

    window.addEventListener("smui.paired-devices", handler as EventListener);

    // ask for current paired devices immediately (covers the case where the
    // pair list was populated before Composer mounted). Also accept a global
    // fallback if present. Retry once to cover effect ordering race.
    const requestPaired = () => {
      try {
        console.debug(
          "Composer: requesting paired devices (smui.request-paired-devices)",
        );
        window.dispatchEvent(new CustomEvent("smui.request-paired-devices"));
        const existing = (window as any).__smui_pairedDevices;
        if (Array.isArray(existing)) {
          console.debug(
            "Composer: found fallback paired devices",
            existing.map((d: PairedDevice) => d.id),
          );
          setPairedDevices(existing);
        }
      } catch (_) {
        /* ignore */
      }
    };

    requestPaired();
    const retry1 = window.setTimeout(requestPaired, 250);
    const retry2 = window.setTimeout(requestPaired, 1000);

    return () => {
      window.removeEventListener(
        "smui.paired-devices",
        handler as EventListener,
      );
      clearTimeout(retry1);
      clearTimeout(retry2);
    };
  }, []);

  // stageSources: placed sources on the stage (prevent duplicates by default)
  const [stageSources, setStageSources] = useState<StagePlacedSource[]>([]);

  // keep local selectedDisplayId in sync with screens.selectedScreenLabel
  useEffect(() => {
    const selLabel = screens.selectedScreenLabel;
    if (!selLabel) return;
    const found = screens.screens.find(
      (s) => s.label === selLabel || s.id === selLabel,
    );
    if (found) setSelectedDisplayId(found.id);
  }, [screens.selectedScreenLabel, screens.screens]);

  // when user picks a display inside Composer, update the shared screens hook
  function handleSelectDisplay(screen: ScreenInfo) {
    // Keep the shared screens hook in sync first
    setSelectedDisplayId(screen.id);
    screens.setSelectedScreenLabel(screen.label);

    // Mirror Sidebar.handleSelectScreen behavior: open/move/focus presenter window
    try {
      const screenInfo =
        screens.screens.find(
          (s) => s.id === screen.id || s.label === screen.label,
        ) ?? screens.screens[0];
      const win = presenterWindowRef?.current;

      // If presenter window not open, open it on the selected screen
      if (!win || (win && (win as Window).closed)) {
        // open presenter with current docs + activeDocId + appearance so it has content
        openPresenter({
          screen: screenInfo,
          docs,
          activeDocId,
          appearance: {
            editor: appearance.editor,
            presenter: appearance.presenter,
          },
        });
        setLastSelectedDisplay(screen.label);
        return;
      }

      // If same display was selected previously, just focus
      if (lastSelectedDisplay === screen.label) {
        if (!win.document.fullscreenElement) win.focus?.();
        return;
      }

      // Move & resize presenter window to the selected display
      if (win && !win.closed && screenInfo) {
        win.resizeTo(400, 300);
        setTimeout(() => {
          try {
            (win as Window).moveTo(screenInfo.left, screenInfo.top);
          } catch (_) {}
          setTimeout(() => {
            try {
              (win as Window).resizeTo(screenInfo.width, screenInfo.height);
            } catch (_) {}
            setTimeout(() => {
              try {
                (win as Window).focus?.();
              } catch (_) {}
              // notify presenter to 'hold for enter' (same as Sidebar)
              send?.({
                type: "hold-for-enter",
                screen: screenInfo,
                rotate: Boolean(appearance?.presenter?.rotateScreen),
              });
            }, 500);
            setLastSelectedDisplay(screen.label);
          }, 500);
        }, 500);
      }
    } catch (err) {
      /* non-fatal — preserve existing behaviour */
      console.debug("Composer: handleSelectDisplay failed", err);
    }
  }

  function handleSelectRemote(p: PairedDevice) {
    // mark remote as selected in the UI and request PairedDeviceList to open it
    setSelectedDisplayId(`remote:${p.id}`);
    // window.dispatchEvent(new CustomEvent("smui.open-remote-device", { detail: p.id }));
    // setLastSelectedDisplay(p.label ?? `Remote ${p.id}`);
  }

  // Build the list of video sources shown in the filmstrip (cameras only)
  // — displays are intentionally NOT included here (they belong in the Displays picker).
  const videoSources: VideoSource[] = useMemo(() => {
    return cams.cameras.map((c) => ({
      id: `cam:${c.deviceId}`,
      kind: "camera",
      label: c.label || `Camera — ${c.deviceId.slice(0, 6)}`,
      available: true,
      raw: c,
    }));
  }, [cams.cameras]);

  // locally-captured screen streams created via the filmstrip "Share screen" card
  const [localSharedScreens, setLocalSharedScreens] = useState<
    Record<string, MediaStream | null>
  >({});

  async function handleAddSharedScreen() {
    try {
      // prompt the user to pick a screen/window/tab (same as presenter)
      const ds = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
      });
      if (!ds) return;
      const track = ds.getVideoTracks()[0];
      const label = track?.label || "Screen";
      const id = `screen:local:${Date.now().toString(36)}`;

      // store stream so StageSourceChip can attach it
      setLocalSharedScreens((prev) => ({ ...prev, [id]: ds }));

      // add to stage (prevent duplicates)
      setStageSources((prev) =>
        prev.some((p) => p.sourceId === id)
          ? prev
          : [...prev, { sourceId: id, kind: "screen", label }],
      );

      // when the shared track ends, remove the stage item + cleanup map
      const onEnded = () => {
        setLocalSharedScreens((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        setStageSources((prev) => prev.filter((p) => p.sourceId !== id));
      };
      track.addEventListener("ended", onEnded);

      // also watch for other tracks ending (defensive)
      ds.getVideoTracks().forEach((t) => t.addEventListener("ended", onEnded));
    } catch (err) {
      // user probably cancelled — keep silent
      console.debug("share-screen cancelled or failed", err);
    }
  }

  // DnD handlers for stage
  const [isDragOverStage, setIsDragOverStage] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  function handleStageDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOverStage) setIsDragOverStage(true);
  }
  function handleStageDragLeave() {
    // simple leave — clear highlight
    setIsDragOverStage(false);
  }
  function handleStageDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOverStage(false);
    const payload = e.dataTransfer.getData("application/x-teleprompter-source");
    if (!payload) return;
    addSourceToStageById(payload);
  }

  function addSourceToStageById(sourceId: string) {
    const src = videoSources.find((v) => v.id === sourceId);
    if (!src) return;
    setStageSources((prev) => {
      // prevent duplicates by default
      if (prev.some((p) => p.sourceId === src.id)) return prev;
      return [...prev, { sourceId: src.id, kind: src.kind, label: src.label }];
    });
  }

  function removeStageSource(sourceId: string) {
    setStageSources((prev) => prev.filter((p) => p.sourceId !== sourceId));
  }

  // Stage sizing (fit selected display aspect ratio)
  const centerContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedScreen =
    screens.screens.find((s) => s.id === selectedDisplayId) ??
    (selectedDisplayId
      ? (() => {
          const rp = pairedDevices.find(
            (p) => `remote:${p.id}` === selectedDisplayId,
          );
          if (rp) {
            return {
              id: `remote:${rp.id}`,
              left: 0,
              top: 0,
              width: rp.screen?.width ?? 1280,
              height: rp.screen?.height ?? 720,
              label: rp.label ?? `Remote ${rp.id}`,
            } as ScreenInfo;
          }
          return null;
        })()
      : null) ??
    screens.screens[0];
  const targetW = selectedScreen?.width ?? 1280;
  const targetH = selectedScreen?.height ?? 720;
  const { renderedWidth, renderedHeight, scale } = useFitRect(
    centerContainerRef,
    targetW,
    targetH,
  );

  return (
    <div className="h-full flex flex-col gap-4 p-6">
      <div className="flex-1 flex gap-6 items-stretch">
        {/* Left: Displays Picker */}
        <DisplaysPicker
          screens={screens.screens}
          pairedDevices={pairedDevices}
          selectedDisplayId={selectedDisplayId}
          onSelectDisplay={handleSelectDisplay}
          onSelectRemote={handleSelectRemote}
        />

        {/* Center: Stage Preview */}
        <StagePreview
          centerContainerRef={centerContainerRef}
          stageRef={stageRef}
          renderedWidth={renderedWidth}
          renderedHeight={renderedHeight}
          isDragOverStage={isDragOverStage}
          onDragOver={handleStageDragOver}
          onDragEnter={handleStageDragOver}
          onDragLeave={handleStageDragLeave}
          onDrop={handleStageDrop}
          selectedScreen={selectedScreen}
          targetW={targetW}
          targetH={targetH}
          stageSources={stageSources}
          cameraPermission={cams.permission}
          localStreams={localSharedScreens}
          onRemoveStageSource={removeStageSource}
        />
      </div>

      {/* Bottom: Video Sources Filmstrip */}

      <VideoSourcesStrip
        videoSources={videoSources}
        onShareScreen={handleAddSharedScreen}
        cameraPermission={cams.permission}
        requestCameraPermission={cams.testCamera}
        onDragStart={() => { /* no-op */ }}
      />
    </div>
  );
}

/* Subcomponents moved to separate files: DisplayMini, VideoSourceCard, StageSourceChip */
