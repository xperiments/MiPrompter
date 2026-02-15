import { useEffect } from "react";
import { EVT_COMPOSER_STREAM } from "../lib/keys";

type LayerLike = {
  id: string;
  sourceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  opacity?: number;
  rotation?: number;
  mirrorX?: boolean;
  fitMode?: "cover" | "contain" | "fill" | "none";
  crop?: { x: number; y: number; w: number; h: number };
  enabled?: boolean;
  kind?: string;
  label?: string;
};

type Options = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layersRef: React.RefObject<LayerLike[]>;
  sourceVideoElsRef: React.RefObject<Map<string, HTMLVideoElement>>;
  sourceStreamsRef: React.RefObject<Map<string, MediaStream>>;
  outStreamRef: React.MutableRefObject<MediaStream | null>;
  animationRef: React.MutableRefObject<number | null>;
  lastRenderRef: React.MutableRefObject<number>;
  camsPermission?: string;
  fps?: number;
  defaultW?: number;
  defaultH?: number;
  renderedWidth?: number;
  renderedHeight?: number;
};

export function useCanvasCompositor({
  canvasRef,
  layersRef,
  sourceVideoElsRef,
  sourceStreamsRef,
  outStreamRef,
  animationRef,
  lastRenderRef,
  camsPermission,
  fps = 12,
  defaultW = 640,
  defaultH = 360,
  renderedWidth,
  renderedHeight,
}: Options) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ctx2 = ctx as CanvasRenderingContext2D;
    const canvasEl = canvas as HTMLCanvasElement;

    canvasEl.width = defaultW;
    canvasEl.height = defaultH;
    const frameMs = 1000 / (fps || 12);

    function computeFit(
      videoW: number,
      videoH: number,
      dw: number,
      dh: number,
      fit: Options["fps"] | any,
    ) {
      if (fit === "fill") return { sx: 0, sy: 0, sw: videoW, sh: videoH, dw, dh };
      const srcAR = videoW / videoH;
      const dstAR = dw / dh;
      if (fit === "none") return { sx: 0, sy: 0, sw: videoW, sh: videoH, dw, dh };
      if (fit === "cover") {
        if (srcAR > dstAR) {
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
          };
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
          };
        }
      }

      return { sx: 0, sy: 0, sw: videoW, sh: videoH, dw, dh };
    }

    function draw() {
      const L = (layersRef.current || [])
        .slice()
        .filter((l) => l.enabled)
        .sort((a, b) => a.zIndex - b.zIndex);

      ctx2.clearRect(0, 0, canvasEl.width, canvasEl.height);

      const srcVideos = (sourceVideoElsRef.current as Map<string, HTMLVideoElement>);

      for (const layer of L) {
        const video = srcVideos.get(layer.sourceId);
        if (!video || (video as HTMLVideoElement).videoWidth === 0 || (video as HTMLVideoElement).videoHeight === 0) {
          if (layer.kind === "camera" && camsPermission !== "granted") {
            try {
              ctx2.save();
              ctx2.fillStyle = "#222";
              ctx2.fillRect(layer.x, layer.y, layer.w, layer.h);
              ctx2.fillStyle = "#fff";
              ctx2.font = "12px sans-serif";
              ctx2.fillText(layer.label || "Camera", layer.x + 8, layer.y + 20);
              ctx2.restore();
            } catch (_) {
              // no-op in test env
            }
          }
          continue;
        }

        const videoW = (video as HTMLVideoElement).videoWidth;
        const videoH = (video as HTMLVideoElement).videoHeight;
        const crop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        const sx = Math.round(crop.x * videoW);
        const sy = Math.round(crop.y * videoH);
        const sw = Math.round(crop.w * videoW);
        const sh = Math.round(crop.h * videoH);

        const dx = layer.x;
        const dy = layer.y;
        const dw = layer.w;
        const dh = layer.h;

        const fit = computeFit(sw, sh, dw, dh, layer.fitMode);
        const drawW = fit.dw ?? dw;
        const drawH = fit.dh ?? dh;
        const offsetX = fit.offsetX ?? 0;
        const offsetY = fit.offsetY ?? 0;

        try {
          ctx2.save();
          ctx2.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

          const cx = dx + dw / 2;
          const cy = dy + dh / 2;
          ctx2.translate(cx, cy);
          if (layer.rotation) ctx2.rotate((layer.rotation * Math.PI) / 180);
          ctx2.scale(layer.mirrorX ? -1 : 1, 1);

          ctx2.drawImage(
            video as CanvasImageSource,
            sx,
            sy,
            sw,
            sh,
            -dw / 2 + offsetX,
            -dh / 2 + offsetY,
            drawW,
            drawH,
          );

          ctx2.restore();
        } catch (_) {
          // ignore drawing failures in test env
        }
      }
    }

    function loop(now: number) {
      try {
        if (now - lastRenderRef.current >= frameMs) {
          lastRenderRef.current = now;
          draw();
        }
      } catch (_) {
        // swallow
      }
      animationRef.current = requestAnimationFrame(loop);
    }

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [camsPermission, canvasRef, layersRef, sourceVideoElsRef, fps, defaultW, defaultH, lastRenderRef, animationRef]);

  // composed stream effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (outStreamRef.current) {
      outStreamRef.current.getTracks().forEach((t) => t.stop());
      outStreamRef.current = null;
      try {
        delete (window as any).__smui_composerStream;
      } catch (_) {}
    }

    const stream = (canvas as HTMLCanvasElement).captureStream(fps || 12);
    outStreamRef.current = stream;
    try {
      (window as any).__smui_composerStream = stream;
    } catch (_) {}
    window.dispatchEvent(new CustomEvent(EVT_COMPOSER_STREAM, { detail: { stream } }));

    return () => {
      if (outStreamRef.current) {
        outStreamRef.current.getTracks().forEach((t) => t.stop());
        outStreamRef.current = null;
      }
    };
  }, [canvasRef, renderedWidth, renderedHeight, fps, outStreamRef]);
}
