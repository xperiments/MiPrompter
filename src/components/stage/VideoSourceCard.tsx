import React, { useEffect, useRef, useState } from "react";
import { usePresenterBridge } from "../../hooks/usePresenterBridge";
import type { CameraInfo } from "../../hooks/useCameraDetection";
import type { ScreenInfo } from "../../lib/presenter";
import Icon from "../ui/Icon";
import { getCameraStream } from "../../lib/media-devices";

export type VideoSource = {
  id: string;
  kind: "camera" | "screen";
  label: string;
  available: boolean;
  raw: CameraInfo | ScreenInfo;
};

export default function VideoSourceCard({
  source,
  cameraPermission,
  requestCameraPermission,
  onDragStart,
}: {
  source: VideoSource;
  cameraPermission?: "granted" | "denied" | "prompt";
  requestCameraPermission?: (deviceId?: string) => Promise<boolean>;
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

  useEffect(() => {
    let mounted = true;
    const cleanupVid = videoRef.current;

    async function initPreview() {
      setPreviewError(null);
      if (source.kind !== "camera") return;
      const cam = source.raw as CameraInfo;
      if (!cam?.deviceId) return;

      try {
        const stream = await getCameraStream(cam.deviceId);
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
    try { e.currentTarget.classList.add("cursor-grabbing"); } catch (_) {}
    e.dataTransfer.setData("application/x-teleprompter-source", source.id);
    e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(source.id);
  }

  function handleDragEnd(e: React.DragEvent) {
    try { e.currentTarget.classList.remove("cursor-grabbing"); } catch (_) {}
  }

  const camDevId = source.kind === "camera" ? (source.raw as CameraInfo).deviceId : undefined;

  return (
    <div
      draggable={source.available}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={source.available ? "Drag to add" : "Unavailable"}
      className={`flex-shrink-0 min-w-[200px] w-56 h-36 relative overflow-hidden rounded-sm ${!source.available ? "opacity-40 cursor-not-allowed" : "cursor-grab"}`}
      aria-label={`Video source ${source.label}`}
    >
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

      {!hasPreview && presenterSnapshot ? (
        <img src={presenterSnapshot} alt="presenter snapshot" className="absolute inset-0 w-full h-full object-cover" />
      ) : null}

      {!hasPreview && !presenterSnapshot ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 bg-black/10">
          <Icon name="camera" width={28} height={28} />
        </div>
      ) : null}

      <div className="absolute left-2 bottom-2 px-2 py-1 rounded bg-black/40 text-xs text-white truncate pointer-events-none">
        {source.label}
      </div>
    </div>
  );
}
