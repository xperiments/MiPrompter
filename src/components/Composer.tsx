import React, { useEffect, useMemo, useRef, useState } from "react";
import { useScreenDetection } from "../hooks/useScreenDetection";
import { useCameraDetection, type CameraInfo } from "../hooks/useCameraDetection";
import { usePresenterBridge } from "../hooks/usePresenterBridge";
import { useScripts } from "../hooks/useScripts";
import { useUiStore } from "../stores/ui";
import type { ScreenInfo } from "../lib/presenter";
import Icon from "./Icon";

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

    console.debug("useFitRect", { container: { w: cw, h: ch }, target: { w: tw, h: th } });
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
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null);
  const [lastSelectedDisplay, setLastSelectedDisplay] = useState<string | null>(null);

  // stageSources: placed sources on the stage (prevent duplicates by default)
  const [stageSources, setStageSources] = useState<StagePlacedSource[]>([]);

  // diagnostics toggle (developer-only helper)
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // keep local selectedDisplayId in sync with screens.selectedScreenLabel
  useEffect(() => {
    const selLabel = screens.selectedScreenLabel;
    if (!selLabel) return;
    const found = screens.screens.find((s) => s.label === selLabel || s.id === selLabel);
    if (found) setSelectedDisplayId(found.id);
  }, [screens.selectedScreenLabel, screens.screens]);

  // when user picks a display inside Composer, update the shared screens hook
  function handleSelectDisplay(screen: ScreenInfo) {
    // Keep the shared screens hook in sync first
    setSelectedDisplayId(screen.id);
    screens.setSelectedScreenLabel(screen.label);

    // Mirror Sidebar.handleSelectScreen behavior: open/move/focus presenter window
    try {
      const screenInfo = screens.screens.find((s) => s.id === screen.id || s.label === screen.label) ?? screens.screens[0];
      const win = presenterWindowRef?.current;

      // If presenter window not open, open it on the selected screen
      if (!win || (win && (win as Window).closed)) {
        // open presenter with current docs + activeDocId + appearance so it has content
        openPresenter({ screen: screenInfo, docs, activeDocId, appearance: { editor: appearance.editor, presenter: appearance.presenter } });
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
              try { (win as Window).focus?.(); } catch (_) {}
              // notify presenter to 'hold for enter' (same as Sidebar)
              send?.({ type: "hold-for-enter", screen: screenInfo, rotate: Boolean(appearance?.presenter?.rotateScreen) });
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
  const [localSharedScreens, setLocalSharedScreens] = useState<Record<string, MediaStream | null>>({});

  async function handleAddSharedScreen() {
    try {
      // prompt the user to pick a screen/window/tab (same as presenter)
      const ds = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      if (!ds) return;
      const track = ds.getVideoTracks()[0];
      const label = track?.label || "Screen";
      const id = `screen:local:${Date.now().toString(36)}`;

      // store stream so StageSourceChip can attach it
      setLocalSharedScreens((prev) => ({ ...prev, [id]: ds }));

      // add to stage (prevent duplicates)
      setStageSources((prev) => (prev.some((p) => p.sourceId === id) ? prev : [...prev, { sourceId: id, kind: "screen", label }]));

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
  const selectedScreen = screens.screens.find((s) => s.id === selectedDisplayId) ?? screens.screens[0];
  const targetW = selectedScreen?.width ?? 1280;
  const targetH = selectedScreen?.height ?? 720;
  const { renderedWidth, renderedHeight, scale } = useFitRect(centerContainerRef, targetW, targetH);

  return (
    <div className="h-full flex flex-col gap-4 p-6">
      <div className="flex-1 flex gap-6 items-stretch">
        {/* Left: Displays Picker */}
        <div className="w-64">
          <h3 className="text-sm text-white/60 mb-3">Displays</h3>
          <div className="space-y-3">
            {(screens.screens || []).map((s) => (
              <DisplayMini
                key={s.id}
                screen={s}
                selected={s.id === selectedDisplayId}
                onSelect={() => handleSelectDisplay(s)}
              />
            ))}
          </div>
        </div>

        {/* Center: Stage Preview */}
        <div className="flex-1 flex flex-col items-center justify-center" >
          <div className="w-full max-w-3xl h-full p-6 flex items-center justify-center" ref={centerContainerRef}>
            <div
              className={`relative bg-white/3 border border-white/8 rounded-2xl transition-all ${
                isDragOverStage ? "ring-4 ring-blue-500/30" : ""
              }`}
              style={{ width: renderedWidth, height: renderedHeight, display: "flex", flexDirection: "column", overflow: "hidden" , maxHeight: "50vh"}}
              ref={stageRef}
              onDragOver={handleStageDragOver}
              onDragEnter={handleStageDragOver}
              onDragLeave={handleStageDragLeave}
              onDrop={handleStageDrop}
            >
              {/* Stage content (preview surface) */}
              <div className="absolute left-4 top-4 flex items-center gap-3">
                <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-black/30 text-xs text-white/90">
                  <Icon name="monitor" width={14} height={14} />
                  <div className="whitespace-nowrap">{selectedScreen?.label}</div>
                </div>

                {selectedScreen?.isPrimary ? (
                  <div className="px-2 py-1 rounded-full bg-white/6 text-xs text-white/80">Primary</div>
                ) : null}

                <div className="ml-2 px-2 py-1 rounded-full bg-white/6 text-xs text-white/80">{`${Math.round(targetW)}×${Math.round(targetH)}`}</div>

                <div className="ml-2 px-2 py-1 rounded-full bg-white/6 text-xs text-white/80">{stageSources.length} source{stageSources.length !== 1 ? "s" : ""}</div>
              </div>

              {/* Center overlay to simulate the prompter surface */}
              <div className="absolute inset-0 flex items-center justify-center text-white/20 text-6xl font-semibold select-none">
                {/* subtle watermark to show preview-only */}
                PREVIEW
              </div>

              {/* Stage placed sources (tiles) */}
              <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
                {stageSources.map((p) => (
                  <StageSourceChip
                    key={p.sourceId}
                    placed={p}
                    cameraPermission={cams.permission}
                    showDiagnostics={showDiagnostics}                    localStreams={localSharedScreens}                    onRemove={() => removeStageSource(p.sourceId)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Video Sources Filmstrip */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
        <h4 className="text-sm text-white/60 mb-2">Video Sources</h4>
        <div className="text-xs">
          <button
            className="px-2 py-1 rounded-md bg-white/6 text-xs text-white/80 hover:bg-white/8"
            onClick={() => setShowDiagnostics((s) => !s)}
          >
            {showDiagnostics ? "Hide diagnostics" : "Show diagnostics"}
          </button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
          {/* Dummy "Share screen/window" card — prompts getDisplayMedia and adds a screen source to the stage */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleAddSharedScreen}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleAddSharedScreen(); }}
            className="flex-shrink-0 min-w-[200px] w-56 h-36 relative overflow-hidden rounded-sm bg-black/10 flex items-center justify-center cursor-pointer text-white/70"
            title="Share screen/window"
            aria-label="Share screen or window"
          >
            <div className="flex flex-col items-center gap-2">
              <Icon name="plus" width={28} height={28} />
              <div className="text-sm">Share screen</div>
            </div>
          </div>

          {videoSources.length === 0 ? (
            <div className="text-sm text-white/50">No video sources detected</div>
          ) : (
            videoSources.map((src) => (
              <VideoSourceCard
                key={src.id}
                source={src}
                cameraPermission={cams.permission}
                requestCameraPermission={cams.testCamera}
                showDiagnostics={showDiagnostics}
                onDragStart={() => {
                  /* no-op here; handled inside component */
                }}
              />
            ))
          )} 
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Subcomponents ---------------------- */

function DisplayMini({
  screen,
  selected,
  onSelect,
}: {
  screen: ScreenInfo;
  selected?: boolean;
  onSelect: () => void;
}) {
  // miniature sizing (fit within 120x80)
  const maxW = 120;
  const maxH = 80;
  const aspect = Math.max(0.1, screen.width / (screen.height || 1));
  let w = maxW;
  let h = Math.round(w / aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * aspect);
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-2 rounded-md border border-white/6 bg-white/3 hover:bg-white/4 text-left ${
        selected ? "ring-2 ring-blue-500/60 bg-white/4" : ""
      }`}
      title={screen.label}
    >
      <div style={{ width: 120 }} className="flex items-center gap-3">
        <div className="flex-shrink-0 bg-black/30 rounded-md" style={{ width: w, height: h }} />
        <div className="flex-1">
          <div className="text-sm text-white/90 truncate">{screen.label}</div>
          <div className="text-xs text-white/50">{Math.round(screen.width)}×{Math.round(screen.height)}</div>
        </div>
      </div>
    </button>
  );
}

function VideoSourceCard({
  source,
  cameraPermission,
  requestCameraPermission,
  showDiagnostics,
  onDragStart,
}: {
  source: VideoSource;
  cameraPermission?: "granted" | "denied" | "prompt";
  requestCameraPermission?: (deviceId?: string) => Promise<boolean>;
  showDiagnostics?: boolean;
  onDragStart?: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { presenterWindowRef } = usePresenterBridge();
  const [presenterSnapshot, setPresenterSnapshot] = useState<string | null>(null);

  // synthetic canvas/stream used when presenter owns the camera
  const syntheticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const syntheticStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [hasPreview, setHasPreview] = useState(false);
  const [previewRequested, setPreviewRequested] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [videoState, setVideoState] = useState({ width: 0, height: 0, readyState: 0, lastEvent: "" as string });

  // attach event listeners for richer diagnostics
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !showDiagnostics) return;
    const handler = (ev: Event) => {
      setVideoState({ width: vid.videoWidth || 0, height: vid.videoHeight || 0, readyState: vid.readyState, lastEvent: ev.type });
      console.debug("Composer: video event", ev.type, { width: vid.videoWidth, height: vid.videoHeight, readyState: vid.readyState });
    };
    ["loadeddata", "playing", "pause", "stalled", "error", "emptied"].forEach((e) => vid.addEventListener(e, handler));
    return () => {
      ["loadeddata", "playing", "pause", "stalled", "error", "emptied"].forEach((e) => vid.removeEventListener(e, handler));
    };
  }, [showDiagnostics]);

  useEffect(() => {
    let mounted = true;
    const cleanupVid = videoRef.current;

    async function initPreview() {
      setPreviewError(null);
      if (source.kind !== "camera") return;
      const cam = source.raw as CameraInfo;
      if (!cam?.deviceId) return;

      try {
        console.debug("Composer: initPreview", cam.deviceId);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cam.deviceId } } });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const vid = videoRef.current;
        if (!vid) {
          setPreviewError("no-video-element");
          return;
        }

        vid.srcObject = stream;

        const onLoaded = () => {
          if (!mounted) return;
          if (vid.videoWidth && vid.videoHeight) {
            setHasPreview(true);
            setPreviewError(null);
          }
        };
        vid.addEventListener("loadeddata", onLoaded);

        const p = vid.play();
        if (p && typeof p.catch === "function") p.catch(() => {});

        const fallback = window.setTimeout(() => {
          if (!mounted) return;
          if (vid.videoWidth && vid.videoHeight) {
            setHasPreview(true);
            setPreviewError(null);
          } else {
            setHasPreview(false);
            setPreviewError("no-frames");
          }
        }, 1200);

        const cleanupPreview = () => {
          vid.removeEventListener("loadeddata", onLoaded);
          clearTimeout(fallback);
        };

        cleanupRef.current = cleanupPreview;
      } catch (err: unknown) {
        console.error("Composer: initPreview error", err);
        setHasPreview(false);
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
        setPreviewError(msg);
      }
    }

    if (source.kind === "camera" && (cameraPermission === "granted" || previewRequested)) {
      initPreview();
    }

    return () => {
      mounted = false;
      setHasPreview(false);
      const cleanup = cleanupRef.current;
      if (cleanup) cleanup();
      cleanupRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (cleanupVid) cleanupVid.srcObject = null;
    };
  }, [source, cameraPermission, previewRequested]);

  // presenter snapshot fallback for filmstrip card (keeps existing behavior)
  useEffect(() => {
    if (hasPreview) {
      setPresenterSnapshot(null);
      return;
    }

    let mounted = true;
    const fetchSnapshot = () => {
      try {
        const pw = presenterWindowRef?.current as Window | null;
        if (!pw || pw.closed) {
          if (mounted) setPresenterSnapshot(null);
          return;
        }
        const pv = pw.document.querySelector("video") as HTMLVideoElement | null;
        if (!pv || pv.videoWidth === 0 || pv.videoHeight === 0) {
          if (mounted) setPresenterSnapshot(null);
          return;
        }

        const c = document.createElement("canvas");
        c.width = pv.videoWidth;
        c.height = pv.videoHeight;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(pv, 0, 0, c.width, c.height);
          const url = c.toDataURL("image/png");
          if (mounted) setPresenterSnapshot(url);
        }

        if (!hasPreview && videoRef.current) {
          let canvas = syntheticCanvasRef.current;
          if (!canvas) {
            canvas = document.createElement("canvas");
            syntheticCanvasRef.current = canvas;
          }
          if (canvas.width !== pv.videoWidth || canvas.height !== pv.videoHeight) {
            canvas.width = pv.videoWidth;
            canvas.height = pv.videoHeight;
          }
          const synthCtx = canvas.getContext("2d");
          if (!synthCtx) return;

          const render = () => {
            try {
              synthCtx.drawImage(pv, 0, 0, canvas.width, canvas.height);
            } catch (_) {
              /* ignore draw failures */
            }
            rafRef.current = window.requestAnimationFrame(render);
          };
          if (!rafRef.current) render();

          if (!syntheticStreamRef.current) {
            syntheticStreamRef.current = canvas.captureStream(15);
            try {
              videoRef.current!.srcObject = syntheticStreamRef.current;
              const p = videoRef.current!.play();
              if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (_) {
              /* ignore */
            }
          }
        }
      } catch (err) {
        if (mounted) setPresenterSnapshot(null);
      }
    };

    fetchSnapshot();
    const id = window.setInterval(fetchSnapshot, 1000);
    return () => {
      mounted = false;
      clearInterval(id);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (syntheticStreamRef.current) {
        syntheticStreamRef.current.getTracks().forEach((t) => t.stop());
        syntheticStreamRef.current = null;
      }
      syntheticCanvasRef.current = null;
    };
  }, [hasPreview, previewRequested, presenterWindowRef]);

  function handleDragStart(e: React.DragEvent) {
    if (!source.available) {
      e.preventDefault();
      return;
    }
    // visual feedback: show grabbing cursor while dragging
    try { e.currentTarget.classList.add("cursor-grabbing"); } catch (_) {}
    e.dataTransfer.setData("application/x-teleprompter-source", source.id);
    e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(source.id);
  }

  function handleDragEnd(e: React.DragEvent) {
    try { e.currentTarget.classList.remove("cursor-grabbing"); } catch (_) {}
  }

  const camDevId = source.kind === "camera" ? (source.raw as CameraInfo).deviceId : undefined;

  // Minimal filmstrip card: only video + overlapping device name; no borders/buttons/type text
  return (
    <div
      draggable={source.available}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={source.available ? "Drag to add" : "Unavailable"}
      className={`flex-shrink-0 min-w-[200px] w-56 h-36 relative overflow-hidden rounded-sm ${!source.available ? "opacity-40 cursor-not-allowed" : "cursor-grab"}`}
      aria-label={`Video source ${source.label}`}
    >
      {/* video / snapshot (fills the card) */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={[
          "absolute inset-0 w-full h-full object-cover transition-opacity duration-200",
          hasPreview ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      {/* presenter snapshot fallback */}
      {!hasPreview && presenterSnapshot ? (
        <img src={presenterSnapshot} alt="presenter snapshot" className="absolute inset-0 w-full h-full object-cover" />
      ) : null}

      {/* empty-state icon when no preview available */}
      {!hasPreview && !presenterSnapshot ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 bg-black/10">
          <Icon name="camera" width={28} height={28} />
        </div>
      ) : null}

      {/* device label overlapping the video */}
      <div className="absolute left-2 bottom-2 px-2 py-1 rounded bg-black/40 text-xs text-white truncate pointer-events-none">
        {source.label}
      </div>
    </div>
  );
}

// Stage chip that may render a live thumbnail when permission is granted
function StageSourceChip({
  placed,
  cameraPermission,
  showDiagnostics,
  localStreams,
  onRemove,
}: {
  placed: StagePlacedSource;
  cameraPermission?: "granted" | "denied" | "prompt";
  showDiagnostics?: boolean;
  localStreams?: Record<string, MediaStream | null>;
  onRemove?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { presenterWindowRef } = usePresenterBridge();
  const [presenterSnapshot, setPresenterSnapshot] = useState<string | null>(null);
  const [hasStream, setHasStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [videoState, setVideoState] = useState({ width: 0, height: 0, readyState: 0, lastEvent: "" as string });

  // diagnostics listeners for the stage video element
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !showDiagnostics) return;
    const handler = (ev: Event) => {
      setVideoState({ width: vid.videoWidth || 0, height: vid.videoHeight || 0, readyState: vid.readyState, lastEvent: ev.type });
      console.debug("Composer(stage): video event", ev.type, { width: vid.videoWidth, height: vid.videoHeight, readyState: vid.readyState });
    };
    ["loadeddata", "playing", "pause", "stalled", "error", "emptied"].forEach((e) => vid.addEventListener(e, handler));
    return () => {
      ["loadeddata", "playing", "pause", "stalled", "error", "emptied"].forEach((e) => vid.removeEventListener(e, handler));
    };
  }, [showDiagnostics]);
  useEffect(() => {
    let mounted = true;
    const cleanupVid = videoRef.current;
    let ownedStream = false; // indicate whether this effect "owns" the created stream (so cleanup may stop it)

    async function attachStream() {
      setStreamError(null);

      // CAMERA: request the device stream if permission allows
      if (placed.kind === "camera") {
        if (cameraPermission !== "granted") return;
        const devId = placed.sourceId.startsWith("cam:") ? placed.sourceId.replace(/^cam:/, "") : undefined;
        if (!devId) return;

        try {
          console.debug("Composer: attachStream for stage", devId);
          ownedStream = true;
          const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: devId } } });
          if (!mounted) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = s;
          const vid = videoRef.current;
          if (!vid) {
            setStreamError("no-video-element");
            return;
          }

          vid.srcObject = s;

          const onLoaded = () => {
            if (!mounted) return;
            if (vid.videoWidth && vid.videoHeight) {
              setHasStream(true);
              setStreamError(null);
            }
          };
          vid.addEventListener("loadeddata", onLoaded);

          const p = vid.play();
          if (p && typeof p.catch === "function") p.catch(() => {});

          const fallback = window.setTimeout(() => {
            if (!mounted) return;
            if (vid.videoWidth && vid.videoHeight) {
              setHasStream(true);
              setStreamError(null);
            } else {
              setHasStream(false);
              setStreamError("no-frames");
            }
          }, 1200);

          cleanupRef.current = () => {
            vid.removeEventListener("loadeddata", onLoaded);
            clearTimeout(fallback);
          };
        } catch (err: unknown) {
          console.error("Composer: attachStream error", err);
          setHasStream(false);
          const msg = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
          setStreamError(msg);
        }

        return;
      }

      // SCREEN: attach a locally-shared screen stream if available
      if (placed.kind === "screen") {
        const local = localStreams?.[placed.sourceId];
        if (!local) return;

        try {
          streamRef.current = local;
          const vid = videoRef.current;
          if (!vid) {
            setStreamError("no-video-element");
            return;
          }

          vid.srcObject = local;

          const onLoaded = () => {
            if (!mounted) return;
            if (vid.videoWidth && vid.videoHeight) {
              setHasStream(true);
              setStreamError(null);
            }
          };
          vid.addEventListener("loadeddata", onLoaded);

          const p = vid.play();
          if (p && typeof p.catch === "function") p.catch(() => {});

          const fallback = window.setTimeout(() => {
            if (!mounted) return;
            if (vid.videoWidth && vid.videoHeight) {
              setHasStream(true);
              setStreamError(null);
            } else {
              setHasStream(false);
              setStreamError("no-frames");
            }
          }, 1200);

          // local streams are _not_ owned by this component, so we don't stop their tracks on cleanup
          cleanupRef.current = () => {
            vid.removeEventListener("loadeddata", onLoaded);
            clearTimeout(fallback);
          };
        } catch (err) {
          console.error("Composer: attach local screen stream failed", err);
          setHasStream(false);
          setStreamError(String(err));
        }

        return;
      }

      // other kinds: nothing to attach
    }

    attachStream();

    return () => {
      mounted = false;
      setHasStream(false);
      const cleanup = cleanupRef.current;
      if (cleanup) cleanup();
      cleanupRef.current = null;
      if (streamRef.current && ownedStream) {
        // only stop tracks if we created/own the stream (camera flow)
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      } else {
        streamRef.current = null;
      }
      if (cleanupVid) cleanupVid.srcObject = null;
    };
  }, [placed, cameraPermission, localStreams]);

  // --- presenter snapshot fallback for stage chip ---
  useEffect(() => {
    if (hasStream) {
      setPresenterSnapshot(null);
      return;
    }

    const mounted = true;
    const fetchSnapshot = () => {
      try {
        const pw = presenterWindowRef?.current as Window | null;
        if (!pw || pw.closed) {
          if (mounted) setPresenterSnapshot(null);
          return;
        }
        const pv = pw.document.querySelector("video") as HTMLVideoElement | null;
        if (!pv || pv.videoWidth === 0 || pv.videoHeight === 0) {
          if (mounted) setPresenterSnapshot(null);
          return;
        }
        const c = document.createElement("canvas");
        c.width = pv.videoWidth;
        c.height = pv.videoHeight;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(pv, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/png");
        if (mounted) setPresenterSnapshot(url);
      } catch (err) {
        if (mounted) setPresenterSnapshot(null);
      }
    };

    fetchSnapshot();
    const id = window.setInterval(fetchSnapshot, 1000);
    return () => {
      clearInterval(id);
    };
  }, [hasStream, presenterWindowRef]);

  return (
    <div className="flex items-center justify-between gap-2 bg-black/30 px-3 py-2 rounded-md text-xs text-white/90">
      <div className="flex items-center gap-2">
        <div className="w-8 h-6 bg-black/40 rounded-sm overflow-hidden flex items-center justify-center text-white/30">
  <div className="relative w-full h-full bg-black">
    {/* Always mount the <video> so videoRef exists; fade it in once frames arrive */}
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={[
        "absolute inset-0 w-full h-full object-cover transition-opacity duration-200",
        hasStream ? "opacity-100" : "opacity-0",
      ].join(" ")}
    />

    {!hasStream && presenterSnapshot ? (
      <img
        src={presenterSnapshot}
        alt="presenter snapshot"
        className="absolute inset-0 w-full h-full object-cover"
      />
    ) : null}

    {!hasStream && !presenterSnapshot ? (
      placed.kind === "camera" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center w-full h-full text-[10px] text-white/60"
          title={streamError ?? undefined}
        >
          <Icon name="camera" width={14} height={14} />
          {streamError ? <div className="mt-0.5">{streamError}</div> : null}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon name="screencast" width={14} height={14} />
        </div>
      )
    ) : null}
  </div>
</div>
        <div className="truncate max-w-[10rem]">{placed.label}</div>
      </div>
      {showDiagnostics ? (
        <div className="ml-3 text-[10px] text-white/60 text-right">
          <div>{videoState.width}×{videoState.height}</div>
          <div>rs: {videoState.readyState}</div>
          <div className="truncate">evt: {videoState.lastEvent}</div>
        </div>
      ) : null}
      <button className="ml-2 opacity-80 hover:opacity-100" onClick={onRemove} aria-label={`Remove ${placed.label}`}>
        <Icon name="close" width={14} height={14} />
      </button>
    </div>
  );
}
