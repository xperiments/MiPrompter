import { useState, useEffect, useRef } from 'react';

export interface MicrophoneInfo {
  deviceId: string;
  label: string;
  groupId?: string;
}

import { MIC_STORAGE_KEY, EVT_PERMISSIONS_UPDATED } from '../lib/keys';

import { lsGet, lsSet, lsRemove } from '../lib/local-storage';

function getStoredMic(): string | null {
  try {
    return lsGet(MIC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistMic(deviceId: string | null): void {
  try {
    if (deviceId) {
      lsSet(MIC_STORAGE_KEY, deviceId);
    } else {
      lsRemove(MIC_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
} 

async function awaitDeviceChange(timeout = 800): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const onChange = () => {
      if (done) return;
      done = true;
      try {
        navigator.mediaDevices?.removeEventListener?.('devicechange', onChange as any);
      } catch {
        // Ignore
      }
      resolve();
    };
    
    try {
      navigator.mediaDevices?.addEventListener?.('devicechange', onChange as any);
    } catch {
      // Ignore
    }
    
    setTimeout(() => {
      if (done) return;
      done = true;
      try {
        navigator.mediaDevices?.removeEventListener?.('devicechange', onChange as any);
      } catch {
        // Ignore
      }
      resolve();
    }, timeout);
  });
}

function selectPreferredMic(mics: MicrophoneInfo[], storedMicId: string | null): MicrophoneInfo | null {
  if (!mics.length) return null;

  // Try to match stored mic
  if (storedMicId) {
    const byDeviceId = mics.find((m) => m.deviceId === storedMicId);
    if (byDeviceId) return byDeviceId;

    const byLabel = mics.find((m) => m.label === storedMicId);
    if (byLabel) return byLabel;

    // Legacy format: "label — deviceId"
    const byLegacy = mics.find((m) => `${m.label} — ${m.deviceId.slice(0, 6)}` === storedMicId);
    if (byLegacy) return byLegacy;
  }

  // Prefer built-in/internal mic
  const builtin = mics.find((m) => /default|built-?in|internal|primary|macbook/i.test(m.label));
  if (builtin) return builtin;

  return mics[0];
}

export function useMicrophoneDetection() {
  const [mics, setMics] = useState<MicrophoneInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(() => getStoredMic());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const storedMicRef = useRef<string | null>(getStoredMic());

  async function enumerateDevices(): Promise<MicrophoneInfo[]> {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || '',
        groupId: (d as any).groupId,
      }));
  }

  async function detectMics() {
    setError(null);
    setLoading(true);

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('MediaDevices API not available');
      }

      let inputs = await enumerateDevices();

      // If we only see 'default' device and permission is granted, try to resolve real devices
      const looksLikeDefaultOnly = (arr: MicrophoneInfo[]) =>
        arr.length === 1 && (arr[0].deviceId === 'default' || arr[0].deviceId === '') && !arr[0].label;

      if (looksLikeDefaultOnly(inputs) && permission === 'granted') {

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const track = stream.getTracks()[0];
          const resolvedId = track.getSettings?.()?.deviceId;

          if (resolvedId && resolvedId !== 'default') {
            inputs = [{ deviceId: resolvedId, label: '', groupId: undefined }];
          } else {
            // Retry enumeration with delays (some browsers populate labels asynchronously)
            for (let i = 0; i < 3; i++) {
              await new Promise((res) => setTimeout(res, 250));
              inputs = await enumerateDevices();
              if (!looksLikeDefaultOnly(inputs)) break;
            }
          }

          track.stop();
        } catch {
          // Ignore and use what we have
        }
      }

      const mapped = inputs.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone — ${d.deviceId.slice(0, 6)}`,
        groupId: d.groupId,
      }));

      if (mapped.length === 0) {
        setMics([]);
        setError('No microphones found');
      } else {
        setMics(mapped);

        // Auto-select preferred mic if none selected
        if (!selectedMicId) {
          const preferred = selectPreferredMic(mapped, storedMicRef.current);
          if (preferred) {
            setSelectedMicId(preferred.deviceId);
          }
        }
      }
    } catch (err: any) {
      setError(String(err?.message ?? err ?? 'Failed to enumerate microphones'));
    } finally {
      setLoading(false);
    }
  }

  async function requestPermission(): Promise<boolean> {
    if (permission === 'granted') return true;

    try {
      setLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermission('granted');

      await awaitDeviceChange(1000);
      await detectMics();
      return true;
    } catch (err: any) {
      setPermission('denied');
      setError(String(err?.message ?? err ?? 'Permission denied'));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function testMic(deviceId?: string): Promise<boolean> {
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      stream.getTracks().forEach((t) => t.stop());
      setPermission('granted');
      await detectMics();
      return true;
    } catch (err: any) {
      setPermission('denied');
      setError(String(err?.message ?? err ?? 'Permission denied'));
      return false;
    } finally {
      setLoading(false);
    }
  }

  // Mount effect: detect mics and query permission
  useEffect(() => {
    detectMics();

    try {
      navigator.permissions
        ?.query?.({ name: 'microphone' as PermissionName })
        .then((p) => setPermission(p.state as any))
        .catch(() => {});
    } catch {
      // Ignore
    }

    function handlePermissionsUpdate() {
      detectMics();
      try {
        navigator.permissions
          ?.query?.({ name: 'microphone' as PermissionName })
          .then((p) => setPermission(p.state as any))
          .catch(() => {});
      } catch {
        // Ignore
      }
    }

    function handleDeviceChange() {
      detectMics();
    }

    window.addEventListener(EVT_PERMISSIONS_UPDATED, handlePermissionsUpdate);
    try {
      navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange as any);
    } catch {
      // Ignore
    }

    return () => {
      window.removeEventListener(EVT_PERMISSIONS_UPDATED, handlePermissionsUpdate);
      try {
        navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange as any);
      } catch {
        // Ignore
      }
    };
  }, []);

  // Auto-select preferred mic when devices populate
  useEffect(() => {
    if (permission !== 'granted' || !mics.length) return;

    const found = selectedMicId && mics.find((m) => m.deviceId === selectedMicId);
    if (found) return;

    const preferred = selectPreferredMic(mics, storedMicRef.current);
    if (preferred) {
      setSelectedMicId(preferred.deviceId);
    }
  }, [permission, mics, selectedMicId]);

  // Persist selected mic
  useEffect(() => {
    persistMic(selectedMicId);
  }, [selectedMicId]);

  return {
    mics,
    selectedMicId,
    setSelectedMicId,
    loading,
    error,
    permission,
    refresh: detectMics,
    requestPermission,
    testMic,
  };
}
