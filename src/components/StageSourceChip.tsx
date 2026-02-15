import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { usePresenterBridge } from "../hooks/usePresenterBridge";

export type StagePlacedSource = {
  sourceId: string;
  kind: "camera" | "screen";
  label: string;
};

export default function StageSourceChip({
  placed,
  cameraPermission,
  localStreams,
  onRemove,
}: {
  placed: StagePlacedSource;
  cameraPermission?: "granted" | "denied" | "prompt";
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

      <button className="ml-2 opacity-80 hover:opacity-100" onClick={onRemove} aria-label={`Remove ${placed.label}`}>
        <Icon name="close" width={14} height={14} />
      </button>
    </div>
  );
}
