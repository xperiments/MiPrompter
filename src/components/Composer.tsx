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
import { getCameraStream, getScreenStream } from "../lib/media-devices";
import { EVT_PAIRED_DEVICES, EVT_REQUEST_PAIRED_DEVICES, EVT_COMPOSER_STREAM } from "../lib/keys";
import Icon from "./ui/Icon";
import DisplaysPicker from "./stage/DisplaysPicker";
import VideoSourcesStrip from "./stage/VideoSourcesStrip";
import StageSourceChip, { type StagePlacedSource } from "./stage/StageSourceChip";

type VideoSourceKind = "camera" | "screen";
type VideoSource = {
  id: string; // prefixed id (cam:..., screen:...)
  kind: VideoSourceKind;
  label: string;
  available: boolean;
  raw: CameraInfo | ScreenInfo;
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
  const appearance = useUiStore((s: any) => s.appearance);

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
      setPairedDevices(Array.isArray(detail) ? detail : []);
    };

    window.addEventListener(EVT_PAIRED_DEVICES, handler as EventListener);

    // ask for current paired devices immediately (covers the case where the
    // pair list was populated before Composer mounted). Also accept a global
    // fallback if present. Retry once to cover effect ordering race.
    const requestPaired = () => {
      try {
        window.dispatchEvent(new CustomEvent(EVT_REQUEST_PAIRED_DEVICES));
        const existing = (window as any).__smui_pairedDevices;
        if (Array.isArray(existing)) {
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
      window.removeEventListener(EVT_PAIRED_DEVICES, handler as EventListener);
      clearTimeout(retry1);
      clearTimeout(retry2);
    };
  }, []);

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
    }
  }

  function handleSelectRemote(p: PairedDevice) {
    // mark remote as selected in the UI and request PairedDeviceList to open it
    setSelectedDisplayId(`remote:${p.id}`);
  }

  // --- Layers model & compositor state -------------------------------------------------
  type FitMode = "cover" | "contain" | "fill" | "none";
  type Layer = {
    id: string;
    sourceId: string;
    kind: "camera" | "screen";
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    zIndex: number;
    opacity: number;
    rotation: number;
    mirrorX: boolean;
    fitMode: FitMode;
    crop?: { x: number; y: number; w: number; h: number };
    enabled: boolean;
  };

  const DEFAULT_CANVAS_W = 640;
  const DEFAULT_CANVAS_H = 360;
  const FPS = 12;

  const [layers, setLayers] = useState<Layer[]>([]);
  const layersRef = useRef<Layer[]>(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // source manager (cache offscreen <video> + stream per sourceId)
  const sourceVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const sourceStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outStreamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastRenderRef = useRef<number>(0);

  const [isDragOverStage, setIsDragOverStage] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // locally-captured screen streams created via the filmstrip "Share screen" card
  const [localSharedScreens, setLocalSharedScreens] = useState<
    Record<string, MediaStream | null>
  >({});

  // helper: create (or reuse) an offscreen <video> for a sourceId if possible
  async function ensureSourceVideo(sourceId: string) {
    if (sourceVideoElsRef.current.has(sourceId)) return;

    // screens shared locally are provided via localSharedScreens
    if (sourceId.startsWith("screen:local:")) {
      const s = localSharedScreens[sourceId];
      if (!s) return;
      const v = document.createElement("video");
      v.autoplay = true;
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      v.style.position = "absolute";
      v.style.left = "-9999px";
      document.body.appendChild(v);
      try {
        await v.play();
      } catch (_) {}
      sourceVideoElsRef.current.set(sourceId, v);
      sourceStreamsRef.current.set(sourceId, s);
      return;
    }

    // camera sources: only open if permission granted and not already opened
    if (sourceId.startsWith("cam:")) {
      if (cams.permission !== "granted") return;
      if (sourceStreamsRef.current.has(sourceId)) {
        // stream already cached
        const existing = sourceStreamsRef.current.get(sourceId)!;
        const v = document.createElement("video");
        v.autoplay = true;
        v.muted = true;
        v.playsInline = true;
        v.srcObject = existing;
        v.style.position = "absolute";
        v.style.left = "-9999px";
        document.body.appendChild(v);
        try {
          await v.play();
        } catch (_) {}
        sourceVideoElsRef.current.set(sourceId, v);
        return;
      }

      const deviceId = sourceId.replace(/^cam:/, "");
      try {
        const s = await getCameraStream(deviceId);
        sourceStreamsRef.current.set(sourceId, s);
        const v = document.createElement("video");
        v.autoplay = true;
        v.muted = true;
        v.playsInline = true;
        v.srcObject = s;
        v.style.position = "absolute";
        v.style.left = "-9999px";
        document.body.appendChild(v);
        try {
          await v.play();
        } catch (_) {}
        sourceVideoElsRef.current.set(sourceId, v);
      } catch (err) {
      }
      return;
    }

    // otherwise: nothing to attach for now
  }

  // keep source <video> ready for each unique source used by layers
  useEffect(() => {
    const ids = Array.from(new Set(layers.map((l) => l.sourceId)));
    ids.forEach((id) => {
      ensureSourceVideo(id).catch(() => {});
    });
  }, [layers, localSharedScreens, cams.permission]);

  // cleanup unused source video elements / streams when layers change
  useEffect(() => {
    const used = new Set(layers.map((l) => l.sourceId));
    for (const [id, videoEl] of Array.from(
      sourceVideoElsRef.current.entries(),
    )) {
      if (!used.has(id)) {
        // remove video element
        try {
          videoEl.pause();
          videoEl.srcObject = null;
          videoEl.remove();
        } catch (_) {}
        sourceVideoElsRef.current.delete(id);
        const s = sourceStreamsRef.current.get(id);
        if (s) {
          s.getTracks().forEach((t) => t.stop());
          sourceStreamsRef.current.delete(id);
        }
      }
    }
  }, [layers]);

  // ensure layers using a localSharedScreens item are removed when that stream ends
  useEffect(() => {
    const localIds = Object.keys(localSharedScreens);
    setLayers((prev) => {
      const filtered = prev.filter((l) =>
        l.sourceId.startsWith("screen:local:")
          ? localIds.includes(l.sourceId)
          : true,
      );
      return layoutLayers(filtered);
    });
  }, [localSharedScreens]);

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

  // add a new layer from a sourceId (drop or share-screen flow)
  function addLayerFromSourceId(sourceId: string) {
    const src = videoSources.find((v) => v.id === sourceId);
    const kind: "camera" | "screen" = sourceId.startsWith("cam:")
      ? "camera"
      : "screen";
    const label =
      src?.label ??
      localSharedScreens[sourceId]?.getVideoTracks()?.[0]?.label ??
      sourceId;

    setLayers((prev) => {
      const newLayer: Layer = {
        id: `layer:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`,
        sourceId,
        kind,
        label: label ?? sourceId,
        x: 0, // will be set by layout
        y: 0,
        w: 0,
        h: 0,
        zIndex: prev.length + 1,
        opacity: 1,
        rotation: 0,
        mirrorX: false,
        fitMode: "contain",
        enabled: true,
      };
      const allLayers = [...prev, newLayer];
      return layoutLayers(allLayers);
    });
  }

  // layout layers based on count
  function layoutLayers(layers: Layer[]): Layer[] {
    const canvasW = DEFAULT_CANVAS_W;
    const canvasH = DEFAULT_CANVAS_H;
    const count = layers.length;

    if (count === 0) return layers;

    if (count === 1) {
      // 1 video: 90% w and h
      const w = canvasW; 
      const h = canvasH;
      const x = Math.round((canvasW - w) / 2);
      const y = Math.round((canvasH - h) / 2);
      return layers.map((l) => ({ ...l, x, y, w, h }));
    }

    if (count === 2) {
      // 2 videos: 1:1 (side by side)
      const w = Math.round(canvasW / 2);
      const h = canvasH;
      return layers.map((l, i) => ({
        ...l,
        x: i * w,
        y: 0,
        w,
        h,
      }));
    }

    if (count === 3) {
      // 3 videos: 1:1 and 1:0 (top two equal, bottom left half-width)
      const topH = Math.round(canvasH / 2);
      const bottomY = topH;
      const bottomH = canvasH - topH;
      const halfW = Math.round(canvasW / 2);
      return layers.map((l, i) => {
        if (i < 2) {
          // top row
          return {
            ...l,
            x: i * halfW,
            y: 0,
            w: halfW,
            h: topH,
          };
        } else {
          // bottom row, left half
          return {
            ...l,
            x: 0,
            y: bottomY,
            w: halfW,
            h: bottomH,
          };
        }
      });
    }

    if (count === 4) {
      // 4 videos: 1:1 and 1:1 (two rows of two)
      const w = Math.round(canvasW / 2);
      const h = Math.round(canvasH / 2);
      return layers.map((l, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        return {
          ...l,
          x: col * w,
          y: row * h,
          w,
          h,
        };
      });
    }

    // fallback for more than 4: just place them in a grid
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const w = Math.round(canvasW / cols);
    const h = Math.round(canvasH / rows);
    return layers.map((l, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      return {
        ...l,
        x: col * w,
        y: row * h,
        w,
        h,
      };
    });
  }

  function removeLayersBySourceId(sourceId: string) {
    setLayers((prev) => {
      const filtered = prev.filter((l) => l.sourceId !== sourceId);
      return layoutLayers(filtered);
    });
  }

  function removeLayerById(id: string) {
    setLayers((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return layoutLayers(filtered);
    });
  }

  // DnD handlers for stage (replace previous stageSources flow)
  function handleStageDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOverStage) setIsDragOverStage(true);
  }
  function handleStageDragLeave() {
    setIsDragOverStage(false);
  }
  function handleStageDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOverStage(false);
    const payload = e.dataTransfer.getData("application/x-teleprompter-source");
    if (!payload) return;
    addLayerFromSourceId(payload);
  }

  // update handleAddSharedScreen to create a layer instead of stageSources
  async function handleAddSharedScreen() {
    try {
      const ds = await getScreenStream();
      if (!ds) return;
      const track = ds.getVideoTracks()[0];
      const label = track?.label || "Screen";
      const id = `screen:local:${Date.now().toString(36)}`;
      setLocalSharedScreens((prev) => ({ ...prev, [id]: ds }));
      addLayerFromSourceId(id);

      const onEnded = () => {
        setLocalSharedScreens((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        setLayers((prev) => prev.filter((p) => p.sourceId !== id));
      };
      track.addEventListener("ended", onEnded);
      ds.getVideoTracks().forEach((t) => t.addEventListener("ended", onEnded));
    } catch (err) {
    }
  }

  // ----------------------------------------------------------------------------
  // compositor render loop (reads from layersRef — no react updates per frame)
  // ----------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas as HTMLCanvasElement;
    const ctx = canvasEl.getContext("2d")!;

    canvasEl.width = DEFAULT_CANVAS_W;
    canvasEl.height = DEFAULT_CANVAS_H;
    const frameMs = 1000 / FPS;

    function computeFit(
      videoW: number,
      videoH: number,
      dw: number,
      dh: number,
      fit: FitMode,
    ) {
      if (fit === "fill")
        return { sx: 0, sy: 0, sw: videoW, sh: videoH, dw, dh };
      // compute source rect for cover / contain
      const srcAR = videoW / videoH;
      const dstAR = dw / dh;
      if (fit === "none")
        return { sx: 0, sy: 0, sw: videoW, sh: videoH, dw, dh };
      if (fit === "cover") {
        if (srcAR > dstAR) {
          // source is wider -> crop sides
          const sh = videoH;
          const sw = Math.round(videoH * dstAR);
          const sx = Math.round((videoW - sw) / 2);
          return { sx, sy: 0, sw, sh, dw, dh };
        } else {
          const sw = videoW;
          const sh = Math.round(videoW / dstAR);
          const sy = Math.round((videoH - sh) / 2);
          return { sx: 0, sy, sw, sh, dw, dh };
        }
      }
      // contain
      if (fit === "contain") {
        if (srcAR > dstAR) {
          const renderW = dw;
          const renderH = Math.round(dw / srcAR);
          const offsetY = Math.round((dh - renderH) / 2);
          return {
            sx: 0,
            sy: 0,
            sw: videoW,
            sh: videoH,
            dw: renderW,
            dh: renderH,
            offsetX: 0,
            offsetY,
          } as any;
        } else {
          const renderH = dh;
          const renderW = Math.round(dh * srcAR);
          const offsetX = Math.round((dw - renderW) / 2);
          return {
            sx: 0,
            sy: 0,
            sw: videoW,
            sh: videoH,
            dw: renderW,
            dh: renderH,
            offsetX,
            offsetY: 0,
          } as any;
        }
      }
      return { sx: 0, sy: 0, sw: videoW, sh: videoH, dw, dh };
    }

    function draw() {
      const L = layersRef.current
        .slice()
        .filter((l) => l.enabled)
        .sort((a, b) => a.zIndex - b.zIndex);
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      for (const layer of L) {
        const video = sourceVideoElsRef.current.get(layer.sourceId);
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
          // draw placeholder for camera without permission or not-ready stream
          if (layer.kind === "camera" && cams.permission !== "granted") {
            ctx.save();
            ctx.fillStyle = "#222";
            ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
            ctx.fillStyle = "#fff";
            ctx.font = "12px sans-serif";
            ctx.fillText(layer.label || "Camera", layer.x + 8, layer.y + 20);
            ctx.restore();
          }
          continue;
        }

        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        // src rect (crop)
        const crop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        const sx = Math.round(crop.x * videoW);
        const sy = Math.round(crop.y * videoH);
        const sw = Math.round(crop.w * videoW);
        const sh = Math.round(crop.h * videoH);

        // dest rect (layer.x/y/w/h)
        const dx = layer.x;
        const dy = layer.y;
        const dw = layer.w;
        const dh = layer.h;

        // apply fitMode to compute drawing dims
        const fit = computeFit(sw, sh, dw, dh, layer.fitMode);
        const drawW = (fit as any).dw ?? dw;
        const drawH = (fit as any).dh ?? dh;
        const offsetX = (fit as any).offsetX ?? 0;
        const offsetY = (fit as any).offsetY ?? 0;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

        // apply transform: translate to center then rotate / mirror
        const cx = dx + dw / 2;
        const cy = dy + dh / 2;
        ctx.translate(cx, cy);
        if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.scale(layer.mirrorX ? -1 : 1, 1);

        // drawImage with computed offsets to honor contain centering
        ctx.drawImage(
          video,
          sx,
          sy,
          sw,
          sh,
          -dw / 2 + offsetX,
          -dh / 2 + offsetY,
          drawW,
          drawH,
        );

        ctx.restore();
      }
    }

    function loop(now: number) {
      try {
        if (now - lastRenderRef.current >= frameMs) {
          lastRenderRef.current = now;
          draw();
        }
      } catch (err) {
      }
      animationRef.current = requestAnimationFrame(loop);
    }

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [cams.permission]);

  // composed stream effect moved below (depends on renderedWidth/renderedHeight) -- see useFitRect section

  // cleanup on unmount: stop cached streams + video elements + canvas stream
  useEffect(() => {
    return () => {
      for (const [id, v] of Array.from(sourceVideoElsRef.current.entries())) {
        try {
          v.pause();
          v.srcObject = null;
          v.remove();
        } catch (_) {}
      }
      for (const s of Array.from(sourceStreamsRef.current.values())) {
        try {
          s.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
      sourceVideoElsRef.current.clear();
      sourceStreamsRef.current.clear();
      if (outStreamRef.current) {
        outStreamRef.current.getTracks().forEach((t) => t.stop());
        outStreamRef.current = null;
      }
      try {
        delete (window as any).__smui_composerStream;
      } catch (_) {}
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // --- pointer / interaction handlers (move + resize) ---------------------------------
  // Removed: video dragging functionality not needed

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

  // expose composed MediaStream and dispatch event
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // stop previous
    if (outStreamRef.current) {
      outStreamRef.current.getTracks().forEach((t) => t.stop());
      outStreamRef.current = null;
      try {
        delete (window as any).__smui_composerStream;
      } catch (_) {}
    }

    const stream = canvas.captureStream(FPS);
    outStreamRef.current = stream;
    (window as any).__smui_composerStream = stream;
    window.dispatchEvent(new CustomEvent(EVT_COMPOSER_STREAM, { detail: { stream } }));

    return () => {
      if (outStreamRef.current) {
        outStreamRef.current.getTracks().forEach((t) => t.stop());
        outStreamRef.current = null;
      }
    };
  }, [renderedWidth, renderedHeight]);

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

        {/* Center: Stage (canvas compositor) */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div
            className={`w-full max-w-3xl h-full p-6 flex items-center justify-center`}
            ref={centerContainerRef}
          >
            <div
              ref={stageRef}
              onDragOver={handleStageDragOver}
              onDragEnter={handleStageDragOver}
              onDragLeave={handleStageDragLeave}
              onDrop={handleStageDrop}
              style={{
                width: renderedWidth,
                height: renderedHeight,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                maxHeight: "50vh",
                position: "relative",
              }}
              className={`relative bg-black/90 border border-white/8 rounded-2xl transition-all ${
                isDragOverStage ? "ring-4 ring-blue-500/30" : ""
              }`}
            >
              {/* canvas (CSS-scaled) */}
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: "100%", display: "block" }}
              />

              {/* top-left badge: resolution + layer count */}
              {/* <div className="absolute left-4 top-4 bg-black/40 text-white/80 text-xs px-2 py-1 rounded-md">
                {DEFAULT_CANVAS_W}×{DEFAULT_CANVAS_H} • {layers.length} source{layers.length !== 1 ? "s" : ""}
              </div> */}

              {/* bottom-left: source chips (unique by sourceId) */}
              <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                {Array.from(
                  new Map(
                    layers.map((l) => [
                      l.sourceId,
                      {
                        sourceId: l.sourceId,
                        kind: l.kind,
                        label: l.label,
                      } as StagePlacedSource,
                    ]),
                  ),
                ).map(([, placed]) => (
                  <StageSourceChip
                    key={placed.sourceId}
                    placed={placed}
                    cameraPermission={cams.permission}
                    localStreams={localSharedScreens}
                    onRemove={() => removeLayersBySourceId(placed.sourceId)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Video Sources Filmstrip */}

      <VideoSourcesStrip
        videoSources={videoSources}
        onShareScreen={handleAddSharedScreen}
        cameraPermission={cams.permission}
        requestCameraPermission={cams.testCamera}
        onDragStart={() => {
          /* no-op */
        }}
      />
    </div>
  );
}

/* Subcomponents moved to separate files: DisplayMini, VideoSourceCard, StageSourceChip */
