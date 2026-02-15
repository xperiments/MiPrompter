import { useState, useEffect, useRef } from "react";
import { getCameraStream, getBasicCameraStream, getOptimalVideoConstraints } from "../lib/media-devices";

export interface CameraInfo {
  deviceId: string;
  label: string;
  groupId?: string;
}

import { CAM_STORAGE_KEY, EVT_PERMISSIONS_UPDATED } from "../lib/keys";
import { lsGet, lsSet, lsRemove } from "../lib/local-storage";
function getStoredCam(): string | null {
  return lsGet(CAM_STORAGE_KEY);
}
function persistCam(deviceId: string | null): void {
  if (deviceId) lsSet(CAM_STORAGE_KEY, deviceId);
  else lsRemove(CAM_STORAGE_KEY);
}

async function enumerateCameras(): Promise<CameraInfo[]> {
  const list = await navigator.mediaDevices.enumerateDevices();
  return list
    .filter((d) => d.kind === "videoinput")
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || "",
      groupId: (d as any).groupId,
    }));
}

export function useCameraDetection() {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(() =>
    getStoredCam(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt">(
    "prompt",
  );
  const storedRef = useRef<string | null>(getStoredCam());

  async function detectCameras() {
    
    setError(null);
    setLoading(true);
    try {
      if (!navigator.mediaDevices?.enumerateDevices)
        throw new Error("MediaDevices API not available");
      let inputs = await enumerateCameras();

      

      // If labels are empty and permission is granted, try to prompt briefly to resolve deviceIds
      const looksLikeDefaultOnly = (arr: CameraInfo[]) =>
        arr.length === 1 &&
        (arr[0].deviceId === "default" || arr[0].deviceId === "") &&
        !arr[0].label;

      if (looksLikeDefaultOnly(inputs) && permission === "granted") {
        const stream = selectedCameraId ? await getCameraStream(selectedCameraId) : await getBasicCameraStream();
        stream.getTracks().forEach((t) => t.stop());
        // re-enumerate
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 250));
          inputs = await enumerateCameras();
          if (!looksLikeDefaultOnly(inputs)) break;
        }
      }

      const mapped = inputs.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera — ${d.deviceId.slice(0, 6)}`,
        groupId: d.groupId,
      }));
      if (mapped.length === 0) {
        setCameras([]);
        setError("No cameras found");
      } else {
        setCameras(mapped);

        // If no stored preference and permission granted, probe each camera and
        // auto-select the one with the highest reported/ideal resolution.
        // This is conservative and only runs when we don't already have a saved
        // device or an explicit selection.
        if (!selectedCameraId && !storedRef.current && permission === "granted") {
          (async () => {
            try {
              let bestId: string | null = null;
              let bestScore = 0;

              for (const cam of mapped) {
                try {
                  const c = await getOptimalVideoConstraints(cam.deviceId);
                  const w = (c.width as any)?.ideal ?? (c.width as any) ?? 0;
                  const h = (c.height as any)?.ideal ?? (c.height as any) ?? 0;
                  const score = (Number(w) || 0) * (Number(h) || 0);
                  if (score > bestScore) {
                    bestScore = score;
                    bestId = cam.deviceId;
                  }
                } catch (_) {
                  // ignore probe errors for individual devices
                }
              }

              if (bestId) {
                setSelectedCameraId(bestId);
              }
            } catch (_) {
              /* ignore */
            }
          })();
        }

        // Auto-select stored if present
        if (!selectedCameraId && storedRef.current) {
          const found = mapped.find(
            (m) =>
              m.deviceId === storedRef.current || m.label === storedRef.current,
          );
          if (found) setSelectedCameraId(found.deviceId);
        }
      }
    } catch (err: any) {
      setError(String(err?.message ?? err ?? "Failed to enumerate cameras"));
    } finally {
      setLoading(false);
    }
  }

  async function requestPermission(): Promise<boolean> {
    if (permission === "granted") return true;
    try {
      setLoading(true);
      const stream = await getBasicCameraStream();
      stream.getTracks().forEach((t) => t.stop());
      setPermission("granted");
      await detectCameras();
      return true;
    } catch (err: any) {
      setPermission("denied");
      setError(String(err?.message ?? err ?? "Permission denied"));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function testCamera(deviceId?: string): Promise<boolean> {
    setLoading(true);
    try {
      const stream = deviceId ? await getCameraStream(deviceId) : await getBasicCameraStream();
      stream.getTracks().forEach((t) => t.stop());
      setPermission("granted");
      await detectCameras();
      return true;
    } catch (err: any) {
      setPermission("denied");
      setError(String(err?.message ?? err ?? "Permission denied"));
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    detectCameras();

    navigator.permissions
      ?.query?.({ name: "camera" as PermissionName })
      .then((p) => setPermission(p.state as any))
      .catch(() => {});

    function handleDeviceChange() {
      detectCameras();
    }
    window.addEventListener(EVT_PERMISSIONS_UPDATED, detectCameras);

    navigator.mediaDevices?.addEventListener?.(
      "devicechange",
      handleDeviceChange as any,
    );

    return () => {
      window.removeEventListener(EVT_PERMISSIONS_UPDATED, detectCameras);

      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        handleDeviceChange as any,
      );
    };
  }, []);

  useEffect(() => {
    persistCam(selectedCameraId ?? null);
  }, [selectedCameraId]);

  return {
    cameras,
    selectedCameraId,
    setSelectedCameraId,
    loading,
    error,
    permission,
    refresh: detectCameras,
    requestPermission,
    testCamera,
  } as const;
}
