import React, { useEffect, useRef, useState } from "react";
import type { ScriptDoc } from "../../types";
import { setPresenterWsSender } from "../../lib/presenter-transport";
import { useScreenDetection } from "../../hooks/useScreenDetection";
import { getBasicCameraStream } from "../../lib/media-devices";
import { EVT_PAIRED_DEVICES, EVT_REQUEST_PAIRED_DEVICES, EVT_WS_READY, EVT_OPEN_REMOTE_DEVICE } from "../../lib/keys";
export default function PairedDeviceList({
  presenterWindowRef,
  onOpenTeleprompter,
  screens,
  on,
  scripts,
  activeScriptId,
  appearance,
}: {
  presenterWindowRef?: React.MutableRefObject<Window | null>;
  onOpenTeleprompter?: () => void;
  screens?: ReturnType<typeof useScreenDetection>;
  on?: (
    type: string,
    handler: (
      payload: unknown,
      meta?: { origin: string; transport: "postMessage" | "ws" },
    ) => void,
  ) => () => void;
  scripts?: ScriptDoc[];
  activeScriptId?: string;
  appearance?: Record<string, any>;
}) {
  type Paired = {
    id: string;
    label?: string;
    ua?: string;
    screen?: { width?: number; height?: number };
    createdAt?: number;
    lastSeen?: number;
  };
  const [paired, setPaired] = useState<Paired[]>(() => []);
  const wsRef = useRef<WebSocket | null>(null);

  // Keep refs to latest scripts/activeScriptId so message handlers always use current values
  const scriptsRef = useRef(scripts);
  const activeScriptIdRef = useRef(activeScriptId);
  const appearanceRef = useRef(appearance);

  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);

  useEffect(() => {
    activeScriptIdRef.current = activeScriptId;
  }, [activeScriptId]);

  useEffect(() => {
    appearanceRef.current = appearance;
  }, [appearance]);

  // When activeScriptId changes, broadcast the updated doc + appearance to WS presenters
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const DEFAULT_WS_ROOM = "smui-default";
    const activeDoc = scriptsRef.current?.find((s) => s.id === activeScriptIdRef.current) ?? null;

    try {
      ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "presenter-load-doc", doc: activeDoc } }));
      ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "set-params", docId: activeScriptIdRef.current ?? null, appearance: appearanceRef.current } }));

      const firstChapterId = activeDoc?.chapters?.[0]?.id ?? null;
      if (firstChapterId) {
        ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "presenter-goto-chapter", chapterId: firstChapterId } }));
      }
    } catch (err) {
      /* ignore */
    }
  }, [activeScriptId]);

  const save = (next: Paired[]) => {
    const normalized = next && next.length ? [next[0]] : [];
    setPaired(normalized);
  };

  // announce paired devices to the rest of the UI (Composer will listen)
  useEffect(() => {
    try {
      (window as any).__smui_pairedDevices = paired;
      window.dispatchEvent(new CustomEvent(EVT_PAIRED_DEVICES, { detail: paired }));
    } catch (_) {
      /* ignore */
    }
  }, [paired]);

  // respond to explicit requests for the current paired devices (Composer may ask on mount)
  useEffect(() => {
    const handleRequest = () => {
      try {
        window.dispatchEvent(new CustomEvent(EVT_PAIRED_DEVICES, { detail: paired }));
      } catch (_) {
        /* ignore */
      }
    };

    window.addEventListener(EVT_REQUEST_PAIRED_DEVICES, handleRequest as EventListener);
    return () => window.removeEventListener(EVT_REQUEST_PAIRED_DEVICES, handleRequest as EventListener);
  }, [paired]);

  useEffect(() => {
    const DEFAULT_WS_ROOM = "smui-default";

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}/ws`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      ws = null;
    }
    wsRef.current = ws;

    if (!ws) return;

    ws.addEventListener("open", () => {
      try {
        ws.send(JSON.stringify({ type: "join", room: DEFAULT_WS_ROOM }));
      } catch (_) {}

      try {
        setPresenterWsSender((msg) => {
          try {
            const s = wsRef.current;
            if (!s || s.readyState !== WebSocket.OPEN) return false;
            s.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: msg }));
            return true;
          } catch (err) {
            return false;
          }
        });

        const activeDoc = scriptsRef.current?.find((s) => s.id === activeScriptIdRef.current) ?? null;
        ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "presenter-load-doc", doc: activeDoc } }));
        ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "set-params", docId: activeScriptIdRef.current ?? null, appearance: appearanceRef.current } }));

        const firstChapterId = activeDoc?.chapters?.[0]?.id ?? null;
        if (firstChapterId) {
          ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "presenter-goto-chapter", chapterId: firstChapterId } }));
        }

        // ask any connected presenters to re-announce themselves (covers controller reloads)
        try {
          ws.send(JSON.stringify({ type: "signal", room: DEFAULT_WS_ROOM, data: { type: "presenter-probe" } }));
        } catch (_) {
          /* ignore */
        }

        window.dispatchEvent(new CustomEvent(EVT_WS_READY));
      } catch (_) {}
    });

    ws.addEventListener("message", (ev) => {
      let msg: any = null;
      try {
        msg = JSON.parse(ev.data);
      } catch (err) {
        return;
      }

      if (msg?.type === "signal" && msg.data) {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: msg.data,
            origin: window.location.origin,
          }),
        );
      }

      if (msg?.type === "pair-request" && msg.id) {
        const id = String(msg.id);
        const info = msg.info || {};
        const label = info?.name || (info?.ua ? info.ua.split(" ")[0] : `Device ${id.slice(0, 4)}`);
        const next: Paired[] = [
          {
            id,
            label,
            ua: info?.ua,
            screen: info?.screen,
            createdAt: Date.now(),
            lastSeen: Date.now(),
          },
        ];
        save(next);

        ws.send(JSON.stringify({ type: "pair-ack", id }));
        return;
      }

      if (msg?.type === "signal" && msg.data?.type === "request-state") {
        try {
          const activeDoc = scriptsRef.current?.find((s) => s.id === activeScriptIdRef.current) ?? null;
          ws.send(JSON.stringify({ type: "signal", room: msg.room || "smui-default", data: { type: "presenter-load-doc", doc: activeDoc } }));
          ws.send(JSON.stringify({ type: "signal", room: msg.room || "smui-default", data: { type: "set-params", docId: activeScriptIdRef.current ?? null, appearance: appearanceRef.current } }));

          const firstChapterId = activeDoc?.chapters?.[0]?.id ?? null;
          if (firstChapterId) {
            ws.send(JSON.stringify({ type: "signal", room: msg.room || "smui-default", data: { type: "presenter-goto-chapter", chapterId: firstChapterId } }));
          }
        } catch (err) {
          /* ignore */
        }
      }
    });

    ws.addEventListener("close", (ev) => {
      if (ws === wsRef.current) {
        wsRef.current = null;
        setPresenterWsSender(null);
      }
    });

    ws.addEventListener("error", (err) => {
    });

    return () => {
    //   if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
      wsRef.current = null;
      setPresenterWsSender(null);
    };
  }, []);

  useEffect(() => {
    const handleInvite = (data: unknown) => {
      if (!data || typeof data !== "object" || data === null) return;
      const rec = data as Record<string, unknown>;
      if (typeof rec.room !== "string") return;
      const room = rec.room;

      const phoneId = paired[0]?.id;
      const ws = wsRef.current;
      if (phoneId && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "presenter-share-invite", to: phoneId, room }));
      }
    };

    if (on) {
      const unsub = on("presenter-share-invite", (payload: unknown) => handleInvite(payload));
      return unsub;
    }

    function onWindowMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      handleInvite(e.data || {});
    }
    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, [paired, on]);



  const selectPaired = async (p: Paired | null) => {
    if (!p) return;

    onOpenTeleprompter?.();

    const win = presenterWindowRef?.current;
    const primary = screens?.screens?.find((s) => s.isPrimary) ?? screens?.screens?.[0] ?? null;

    const remoteW = p?.screen?.width ?? null;
    const remoteH = p?.screen?.height ?? null;
    const targetW = remoteW ?? window.screen?.width ?? window.innerWidth;
    const targetH = remoteH ?? window.screen?.height ?? window.innerHeight;

    if (win && !win.closed && primary) {
      win.resizeTo(320, 200);
      setTimeout(() => {
        win.moveTo(primary.left ?? 0, primary.top ?? 0);
        setTimeout(() => {
          win.resizeTo(Math.max(320, Math.round(targetW)), Math.max(200, Math.round(targetH)));
          win.focus?.();
        }, 300);
      }, 200);
    }

    const roomId = "smui-default";
    const presenterUrl = `${location.origin}/app.html?transport=ws#${roomId}`;

    try {
      const ws = wsRef?.current;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "presenter-open", url: presenterUrl, to: p.id }));
      }
    } catch (err) {
      /* ignore */
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "join", room: roomId }));

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.addEventListener("icecandidate", (e) => {
      if (!e.candidate) return;
      ws?.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
    });

    const dc = pc.createDataChannel("smui-control");
    dc.onopen = () => {};
    dc.onmessage = () => {};

    try {
      const stream = await getBasicCameraStream();
      for (const t of stream.getTracks()) pc.addTrack(t, stream);
    } catch (_) {
      /* ignore */
    }

    pc.addEventListener("track", () => {});

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    ws?.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));

    const onWsMessage = (ev: MessageEvent) => {
      const msg = JSON.parse(ev.data);
      if (msg?.type === "signal" && msg.data) {
        window.postMessage(msg.data, window.location.origin);
        return;
      }

      if (msg?.type === "state" && msg.data) {
        const d = msg.data as any;
        if (d.payload) window.postMessage({ type: "presenter-init", ...d.payload }, window.location.origin);
        if (typeof d.playing === "boolean") window.postMessage({ type: "presenter-playing", playing: d.playing }, window.location.origin);
        if (typeof d.mic === "boolean") window.postMessage({ type: "presenter-mic", active: d.mic }, window.location.origin);
        if (typeof d.wordIndex === "number") window.postMessage({ type: "presenter-word-index", index: d.wordIndex }, window.location.origin);
        return;
      }

      if (msg?.type === "answer") {
        const desc = { type: "answer", sdp: msg.sdp } as RTCSessionDescriptionInit;
        pc.setRemoteDescription(desc).catch(() => {});
        return;
      }

      if (msg?.type === "ice" && msg.candidate) {
        pc.addIceCandidate(msg.candidate).catch(() => {});
        return;
      }
    };

    ws?.addEventListener("message", onWsMessage);

    setPresenterWsSender((msg) => {
      try {
        const s = wsRef.current;
        if (!s || s.readyState !== WebSocket.OPEN) return false;
        s.send(JSON.stringify({ type: "signal", room: roomId, data: msg }));
        return true;
      } catch (err) {
        return false;
      }
    });

    try {
      const activeDoc = scriptsRef.current?.find((s) => s.id === activeScriptIdRef.current) ?? null;
      wsRef.current?.send(JSON.stringify({ type: "signal", room: roomId, data: { type: "presenter-load-doc", doc: activeDoc } }));
      wsRef.current?.send(JSON.stringify({ type: "signal", room: roomId, data: { type: "set-params", docId: activeScriptIdRef.current ?? null, appearance: appearanceRef.current } }));

      const firstChapterId = activeDoc?.chapters?.[0]?.id ?? null;
      if (firstChapterId) {
        wsRef.current?.send(JSON.stringify({ type: "signal", room: roomId, data: { type: "presenter-goto-chapter", chapterId: firstChapterId } }));
      }
    } catch (_) {}

    window.dispatchEvent(new CustomEvent(EVT_WS_READY, { detail: { room: roomId } }));

    const cleanup = () => {
      ws?.removeEventListener("message", onWsMessage);
      pc.close();
      setPresenterWsSender(null);
    };
    window.addEventListener("beforeunload", cleanup, { once: true });

    save([{ ...(paired[0] ?? p), lastSeen: Date.now() }]);
  };

  // listen for requests from the UI to open a remote/paired device
  useEffect(() => {
    const handler = (ev: Event) => {
      const id = (ev as CustomEvent)?.detail;
      if (!id) return;
      const p = paired.find((x) => x.id === id) ?? paired[0] ?? null;
      selectPaired(p);
    };

    window.addEventListener(EVT_OPEN_REMOTE_DEVICE, handler as EventListener);
    return () => window.removeEventListener(EVT_OPEN_REMOTE_DEVICE, handler as EventListener);
  }, [paired]);

  // component is now non-visual — all pairing / signaling logic remains active
  // expose pairing state internally (no UI rendering here)
  return null;
}
