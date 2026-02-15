/**
 * Centralized media device utilities
 */

type Mode = { w: number; h: number; fps: number };

const MODES_16_9: Mode[] = [
  { w: 1920, h: 1080, fps: 30 },
  { w: 1280, h: 720,  fps: 30 },
  { w: 960,  h: 540,  fps: 30 },
  { w: 640,  h: 360,  fps: 30 }
];

const MODES_4_3: Mode[] = [
  { w: 1280, h: 960, fps: 30 },
  { w: 1024, h: 768, fps: 30 },
  { w: 800,  h: 600, fps: 30 },
  { w: 640,  h: 480, fps: 30 }
];

function chooseMode(cap: MediaTrackCapabilities): Mode {
  const maxW = cap.width?.max ?? 1280;
  const maxH = cap.height?.max ?? 720;
  const ratio = maxW / maxH;
  const list = Math.abs(ratio - 16/9) < 0.2 ? MODES_16_9 : MODES_4_3;
  for (const m of list) if (m.w <= maxW && m.h <= maxH) return m;
  return list[list.length - 1];
}

export async function getOptimalVideoConstraints(deviceId: string): Promise<MediaTrackConstraints> {
  let probe: MediaStream | null = null;
  let probeTrack: MediaStreamTrack | null = null;

  try {
    probe = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
    probeTrack = probe.getVideoTracks()[0];
    const cap = probeTrack.getCapabilities();

    // Pick the list (16:9 vs 4:3) then try candidate exact modes in descending quality
    const ratio = (cap.width?.max ?? 1280) / (cap.height?.max ?? 720);
    const list = Math.abs(ratio - 16 / 9) < 0.2 ? MODES_16_9 : MODES_4_3;

    const candidates = list.filter((m) => (m.w <= (cap.width?.max ?? m.w) && m.h <= (cap.height?.max ?? m.h)));

    for (const cand of candidates) {
      try {
        await probeTrack.applyConstraints({ width: { exact: cand.w }, height: { exact: cand.h } } as MediaTrackConstraints);
        const s = probeTrack.getSettings();
        if (s.width === cand.w && s.height === cand.h) {
          probe.getTracks().forEach((t) => t.stop());
          return {
            deviceId: { exact: deviceId },
            width: { ideal: cand.w },
            height: { ideal: cand.h },
            frameRate: { ideal: Math.min(cand.fps, cap.frameRate?.max ?? cand.fps) },
            aspectRatio: cand.w / cand.h,
          };
        }
      } catch (_) {
        // try next candidate
      }
    }

    // none of the exact candidates accepted — fall back to the best-fit mode
    const mode = chooseMode(cap);
    probe.getTracks().forEach((t) => t.stop());
    return {
      deviceId: { exact: deviceId },
      width: { ideal: mode.w },
      height: { ideal: mode.h },
      frameRate: { ideal: Math.min(mode.fps, cap.frameRate?.max ?? 30) },
      aspectRatio: mode.w / mode.h,
    };
  } catch (err) {
    try { probeTrack?.stop(); probe?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    return {
      deviceId: { exact: deviceId },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      aspectRatio: 16 / 9,
    };
  }
}

export async function getCameraStream(deviceId: string): Promise<MediaStream> {
  const constraints = await getOptimalVideoConstraints(deviceId);

  const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
  const track = stream.getVideoTracks()[0];

  // Try to coerce the device to the chosen mode. Many cameras expose a native
  // resolution (e.g. 1920×1200) and will ignore an 'ideal' 1920×1080 request —
  // attempt applyConstraints() first with exact values, then fall back to the
  // original constraints if that fails.
  const desiredWidth = (constraints.width as any)?.ideal ?? (constraints.width as any) ?? undefined;
  const desiredHeight = (constraints.height as any)?.ideal ?? (constraints.height as any) ?? undefined;
  const desiredFps = (constraints.frameRate as any)?.ideal ?? (constraints.frameRate as any) ?? undefined;

  if (track && (desiredWidth || desiredHeight || desiredFps)) {
    try {
      await track.applyConstraints({
        width: desiredWidth ? { exact: desiredWidth } : undefined,
        height: desiredHeight ? { exact: desiredHeight } : undefined,
        frameRate: desiredFps ? { exact: desiredFps } : undefined,
      } as MediaTrackConstraints);
    } catch (err) {
      // exact apply failed — try a softer apply with the original (ideal) constraints
      try {
        await track.applyConstraints(constraints as MediaTrackConstraints);
      } catch (_) {
        // not fatal — leave the stream as-is
      }
    }
  }

  return stream;
}

export async function getScreenStream(): Promise<MediaStream> {
  return (navigator.mediaDevices as any).getDisplayMedia({ video: true });
}

export async function getBasicCameraStream(deviceId?: string): Promise<MediaStream> {
  const constraints = deviceId ? { deviceId: { exact: deviceId } } : true;
  return navigator.mediaDevices.getUserMedia({ video: constraints });
}

export async function getAudioVideoStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: true });
}