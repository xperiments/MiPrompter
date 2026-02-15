import React, { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { usePresenterBridge } from "../../hooks/usePresenterBridge";
import { getCameraStream } from "../../lib/media-devices";

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
  const [presenterSnapshot, setPresenterSnapshot] = useState<string | null>(
    null,
  );
  const [hasStream, setHasStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    // depend on stable primitives (sourceId / kind) instead of the whole `placed` object
    let mounted = true;
    const cleanupVid = videoRef.current;
    let ownedStream = false; // indicate whether this effect "owns" the created stream (so cleanup may stop it)

    async function attachStream() {
      setStreamError(null);

      // CAMERA: request the device stream if permission allows
      if (placed.kind === "camera") {
        if (cameraPermission !== "granted") return;
        const devId = placed.sourceId.startsWith("cam:")
          ? placed.sourceId.replace(/^cam:/, "")
          : undefined;
        if (!devId) return;

        try {
          ownedStream = true;
          const s = await getCameraStream(devId);
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
          const msg =
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : String(err);
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
  }, [placed.sourceId, placed.kind, cameraPermission, localStreams]);

  // --- presenter snapshot fallback for stage chip ---
  useEffect(() => {
    if (hasStream) {
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
        const pv = pw.document.querySelector(
          "video",
        ) as HTMLVideoElement | null;
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
      mounted = false;
      clearInterval(id);
    };
  }, [hasStream, presenterWindowRef]);

  return (
    <div className="w-8 h-6 rounded-sm overflow-hidden">
      {/* Only show the video thumbnail; add a red border */}
      <div className="relative w-full h-full bg-black">
        <video
          ref={videoRef}
          onClick={onRemove}
          autoPlay
          muted
          playsInline
          style={{ boxSizing: "border-box", border: "2px solid #ef4444" }}
          className={[
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-200",
            hasStream ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
      </div>
    </div>
  );
}
