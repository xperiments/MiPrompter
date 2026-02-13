import React, { useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useWindowMessages } from "./lib/window-message";
import Icon from "./components/Icon";

// --- Types ---
type ScriptChapter = { id: string; text: string };
type ScriptDocShape = {
  id?: string;
  name?: string;
  chapters?: ScriptChapter[];
};

type Appearance = Partial<{
  fontSize: number;
  sideMargins?: number;
  lineSpacing: number;
  paragraphSpacing: number;
  highlightActiveWord: boolean;
  alignment: "left" | "center" | "right";
  mirrorMode: boolean;
  rotateScreen: boolean;
  preserveFormatting: boolean;
  voiceCommands: boolean;
  smoothAnimations: boolean;
  showStopSigns: boolean;
  // centerline controls
  showCenterline?: boolean;
  activeLineGuideHeight?: number;
  activeLinePosition: number;
  // selected font-family (Google Fonts key, e.g. 'Inter' or 'Open+Sans')
  fontFamily?: string;
  // selected video input device id — when set, presenter will show the camera above the text
  videoDeviceId?: string | null;

  // overlay controls
  showOverlay?: boolean;
  overlayShape?: "camera" | "circle" | "cross" | "snap" | "square";
  overlayColor?: string;
  overlayOpacity?: number;
  overlayPosX?: number;
  overlayPosY?: number;
}>;

type InitPayload = Partial<{
  docId: string | null;
  doc: ScriptDocShape | null;
  appearance?: Appearance;
}>;

type PresenterState = {
  ready: boolean;
  playing: boolean;
  mic: boolean;
  lastCmd: string | null;
  payload: InitPayload;
  currentChapterId: string | null;
  // Prompter specific
  wordIndex: number;
  speechLang: string;
};

type Action =
  | { type: "ready" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle-mic" }
  | { type: "set-mic"; active: boolean }
  | { type: "cmd"; cmd: string }
  | { type: "init"; incoming: InitPayload }
  | { type: "load-doc"; doc: ScriptDocShape }
  | { type: "set-chapter"; chapterId: string | null }
  | { type: "set-word-index"; index: number }
  | { type: "prev-word" }
  | { type: "next-word" }
  | { type: "reset" }
  | { type: "set-lang"; lang: string };

// --- Tokenizer ---

type Token = {
  id: string;
  text: string;
  clean: string;
  isWord: boolean;
  skip: boolean;
  isStop?: boolean;
  isParagraphBreak?: boolean;
  index: number;
};

function parseScriptToTokens(
  doc: ScriptDocShape | null,
  preserveFormatting: boolean,
): Token[] {
  if (!doc || !doc.chapters) return [];
  let tokens: Token[] = [];
  let globalWordIndex = 0;

  doc.chapters.forEach((chapter, chIdx) => {
    let text = chapter.text || "";
    const chapterId = chapter.id;

    // Fix: VoicePrompter logic
    if (preserveFormatting) {
      text = text.replace(/\n/g, " ||BR|| ");
    } else {
      text = text.replace(/\n+/g, " ||LB|| ");
    }

    // Split
    const rawWords = text.split(/\s+/);

    let inBracket = false;

    rawWords.forEach((word, wIdx) => {
      if (!word) return;
      const id = `${chapterId}-${wIdx}`; // Unique token ID

      // Stop Sign
      if (word === "||LB||") {
        tokens.push({
          id,
          text: "🛑",
          clean: "",
          isWord: false,
          isStop: true,
          skip: true,
          index: -1,
        });
        return;
      }
      // Paragraph Break
      if (word === "||BR||") {
        tokens.push({
          id,
          text: "",
          clean: "",
          isWord: false,
          isParagraphBreak: true,
          skip: true,
          index: -1,
        });
        return;
      }

      // Skip / Bracket Logic
      if (word.startsWith("[")) inBracket = true;
      const isEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(word);
      const shouldSkip = inBracket || isEmoji;
      if (word.endsWith("]")) inBracket = false;

      const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

      tokens.push({
        id,
        text: word, // Display text
        clean: cleanWord, // Speech match text
        isWord: true,
        skip: shouldSkip,
        index: shouldSkip ? -1 : globalWordIndex++,
      });
    });

    // Separator between chapters
    if (chIdx < (doc.chapters?.length || 0) - 1) {
      tokens.push({
        id: `ch-sep-${chIdx}`,
        text: "",
        clean: "",
        isWord: false,
        isParagraphBreak: true,
        skip: true,
        index: -1,
      });
    }
  });

  return tokens;
}

const initialState: PresenterState = {
  ready: false,
  playing: false,
  mic: false,
  lastCmd: null,
  payload: {},
  currentChapterId: null,
  wordIndex: 0,
  speechLang: "es-ES",
};

function mergePayload(prev: InitPayload, incoming: InitPayload): InitPayload {
  return {
    ...prev,
    ...incoming,
    appearance: {
      ...(prev.appearance ?? {}),
      ...(incoming.appearance ?? {}),
    },
  };
}

function reducer(state: PresenterState, action: Action): PresenterState {
  switch (action.type) {
    case "ready":
      return { ...state, ready: true };
    case "play":
      return { ...state, playing: true };
    case "pause":
      return { ...state, playing: false };
    case "toggle-mic":
      return { ...state, mic: !state.mic };
    case "set-mic":
      return { ...state, mic: Boolean(action.active) };
    case "cmd":
      return { ...state, lastCmd: action.cmd };
    case "init": {
      const nextPayload = mergePayload(state.payload, action.incoming);
      const nextChapterId =
        action.incoming.doc !== undefined
          ? (action.incoming.doc?.id ?? null)
          : state.currentChapterId;
      return {
        ...state,
        payload: nextPayload,
        currentChapterId: nextChapterId,
      };
    }
    case "load-doc": {
      return {
        ...state,
        payload: { ...state.payload, doc: action.doc },
        currentChapterId: action.doc?.chapters?.[0]?.id ?? null,
        wordIndex: 0,
      };
    }
    case "set-chapter":
      return {
        ...state,
        currentChapterId: action.chapterId ?? null,
        wordIndex: 0,
      };
    case "set-word-index":
      return { ...state, wordIndex: action.index };
    case "reset":
      return { ...state, wordIndex: 0 };
    case "set-lang":
      return { ...state, speechLang: action.lang };
    default:
      return state;
  }
}

// --- Speech Logic ---
// (Removed internal speech logic as recording moved to App.tsx)
// ...

function PrompterView({
  tokens,
  activeIndex,
  appearance,
  onWordClick,
}: {
  tokens: Token[];
  activeIndex: number;
  appearance: Appearance;
  onWordClick: (idx: number) => void;
}) {
  const activeRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll: align the *center* of the active word with the configured
  // `appearance.activeLinePosition` (percentage of the presenter viewport).
  // This keeps the highlighted word vertically aligned with the guide line.
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;

    try {
      // Find the nearest scrollable ancestor (the presenter root div). Fallback to
      // the document scrolling element when needed.
      const scrollParent =
        (el.closest && el.closest(".prompter-content")?.parentElement) ||
        document.scrollingElement ||
        document.documentElement;
      const parent = scrollParent as HTMLElement;
      const parentRect = parent.getBoundingClientRect
        ? parent.getBoundingClientRect()
        : ({ top: 0, height: window.innerHeight } as any);
      const elRect = el.getBoundingClientRect();

      // Desired vertical position inside the parent (px). Use the same default
      // as the Sidebar/Slider (35%) and clamp to a safe 10-90% range.
      const pct =
        typeof appearance.activeLinePosition === "number"
          ? appearance.activeLinePosition
          : 35;
      const clampedPct = Math.max(10, Math.min(90, pct)) / 100;
      const desiredPx = Math.round(
        clampedPct * (parent.clientHeight || window.innerHeight),
      );

      // Current element center relative to the parent's content (account for scrollTop)
      const elCenterRelativeToParent =
        elRect.top -
        parentRect.top +
        elRect.height / 2 +
        (parent.scrollTop || 0);

      // Compute new scrollTop to place element center at desiredPx
      let targetScrollTop = Math.max(
        0,
        Math.round(elCenterRelativeToParent - desiredPx),
      );

      // Apply scrolling with optional smooth animation
      if (typeof parent.scrollTo === "function") {
        parent.scrollTo({
          top: targetScrollTop,
          behavior: appearance.smoothAnimations ? "smooth" : "auto",
        });
      } else {
        parent.scrollTop = targetScrollTop;
      }
    } catch (err) {
      // Fallback to a safe scrollIntoView if anything fails
      try {
        el.scrollIntoView({
          behavior: appearance.smoothAnimations ? "smooth" : "auto",
          block: "center",
          inline: "nearest",
        });
      } catch (_) {}
    }
  }, [activeIndex, appearance.smoothAnimations, appearance.activeLinePosition]);

  const fontSize = appearance.fontSize || 40;
  // Ensure selected font is loaded (Google Fonts) — load only the family in use
  React.useEffect(() => {
    const family = appearance.fontFamily;
    if (!family) return;
    // Convert stored key (Open+Sans) to Google Fonts family name (space-friendly)
    const cssFamily = family.replace(/\+/g, " ");
    const href = `https://fonts.googleapis.com/css2?family=${family}:wght@300;400;600&display=swap`;

    // If already loaded, nothing to do
    const exists = Array.from(document.head.querySelectorAll("link")).some(
      (l) => l.getAttribute("data-gf-family") === family,
    );
    if (exists) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-gf-family", family);
    document.head.appendChild(link);

    return () => {
      // keep the font link (caching) — no removal
    };
  }, [appearance.fontFamily]);

  // Normalize line spacing: if > 10 assuming it is percentage (e.g. 140 for 140%), else multiplier (1.4)
  let rawLineHeight = appearance.lineSpacing || 1.5;
  if (rawLineHeight > 10) rawLineHeight = rawLineHeight / 100;
  const lineHeight = rawLineHeight;

  const marginX = appearance.sideMargins
    ? `${appearance.sideMargins}vw`
    : "10vw";
  const fontFamilyStack = appearance.fontFamily
    ? `${appearance.fontFamily.replace(/\+/g, " ")}, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
    : undefined;

  return (
    <div
      className="prompter-content"
      style={{
        position: "relative",
        zIndex: 10,
        paddingLeft: marginX,
        paddingRight: marginX,
        // Make vertical padding follow the active-line position so the
        // highlighted word can sit exactly on the guide line even at
        // non-centered positions. We keep the sum = 100vh to preserve
        // the same scrollable region behavior as before.
        paddingTop: `${Math.max(10, Math.min(90, appearance.activeLinePosition ?? 35))}vh`,
        paddingBottom: `${100 - Math.max(10, Math.min(90, appearance.activeLinePosition ?? 35))}vh`,
        fontSize: `${fontSize}px`,
        lineHeight: lineHeight,
        fontFamily: fontFamilyStack,
        textAlign: appearance.alignment || "left",
        color: "white",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {tokens.map((t) => {
        // 1. Paragraph (formatting preserved)
        if (t.isParagraphBreak) {
          const mb = (appearance.paragraphSpacing || 1) * fontSize;
          return <div key={t.id} style={{ height: mb, width: "100%" }} />;
        }

        // 2. Stop Markers
        if (t.isStop) {
          if (!appearance.showStopSigns) return <span key={t.id}> </span>; // space replacement
          return (
            <span
              key={t.id}
              style={{ color: "red", margin: "0 4px", fontSize: "0.8em" }}
            >
              🛑
            </span>
          );
        }

        // 3. Skip Words or Normal Words
        if (t.isWord) {
          // VoicePrompter style:
          // Past words -> Dimmed (gray)
          // Current word -> Highlighted
          // Future words -> White/Normal
          // Skipped -> Special style?

          let color = "white"; // Future default
          let opacity = 1;

          if (t.skip) {
            color = "#6b7280"; // gray-500
          } else {
            if (t.index < activeIndex) {
              color = "#6b7280"; // Past = dimmed
            } else if (t.index === activeIndex) {
              color = appearance.highlightActiveWord ? "#ffff00" : "white";
              // VoicePrompter actually just highlights class 'current-word'
            }
            // Future remains white
          }

          return (
            <span
              key={t.id}
              ref={t.index === activeIndex ? activeRef : null}
              onClick={() => !t.skip && onWordClick(t.index)}
              style={{
                cursor: t.skip ? "default" : "pointer",
                color: color,
                opacity: opacity,
                backgroundColor:
                  t.index === activeIndex && appearance.highlightActiveWord
                    ? "rgba(255, 255, 0, 0.2)"
                    : "transparent",
                borderRadius: 4,
                padding: "0 2px",
                display: "inline-block",
              }}
            >
              {t.text}{" "}
            </span>
          );
        }
        // Fallback?
        return <span key={t.id}>{t.text} </span>;
      })}
    </div>
  );
}

function Presenter() {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const applyInit = React.useCallback((incoming: InitPayload) => {
    dispatch({ type: "init", incoming: incoming || {} });
  }, []);

  // Provide a single message handler that works for both postMessage and WS-sourced messages
  const handleIncoming = React.useCallback(
    async (data: any) => {
      if (!data || typeof data.type !== "string") return;
      dispatch({ type: "cmd", cmd: data.type });

      switch (data.type) {
        case "set-params":
        case "presenter-init":
          applyInit(data);
          break;
        case "presenter-load-doc":
          if (data.doc) dispatch({ type: "load-doc", doc: data.doc });
          break;
        case "play":
          dispatch({ type: "play" });
          break;
        case "pause":
          dispatch({ type: "pause" });
          break;
        case "toggle-mic":
          dispatch({ type: "toggle-mic" });
          break;
        case "prompter-reset":
          dispatch({ type: "reset" });
          break;
        case "set-word-index":
          dispatch({ type: "set-word-index", index: data.index });
          break;
        case "presenter-goto-chapter":
          try {
            const cid =
              typeof data.chapterId === "string" ? data.chapterId : null;
            dispatch({ type: "set-chapter", chapterId: cid });

            // If the doc is already loaded we can compute the first token index
            // for the requested chapter and jump immediately.
            try {
              const doc = state.payload.doc ?? null;
              if (cid && doc) {
                const tok = parseScriptToTokens(
                  doc,
                  Boolean(state.payload.appearance?.preserveFormatting),
                );
                const first = tok.find(
                  (t) => t.isWord && t.id.startsWith(`${cid}-`),
                );
                if (
                  first &&
                  typeof first.index === "number" &&
                  first.index >= 0
                ) {
                  dispatch({ type: "set-word-index", index: first.index });
                }
              }
            } catch (_) {}

            // inform controller that the chapter was applied
            const w = window.opener || window.parent;
            if (w)
              w.postMessage(
                {
                  type: "presenter-chapter-loaded",
                  docId: state.payload.doc?.id ?? null,
                  chapterId: cid,
                },
                window.location.origin,
              );
          } catch (_) {}
          break;
        case "presenter-playing":
          if (data.playing) dispatch({ type: "play" });
          else dispatch({ type: "pause" });
          break;
        case "presenter-mic":
          dispatch({ type: "set-mic", active: Boolean(data.active) });
          break;
        case "presenter-voice-commands":
          try {
            console.info("[Presenter] voice commands config", data.config);
          } catch (_) {}
          // reflect in lastCmd for visibility / telemetry
          dispatch({ type: "cmd", cmd: "presenter-voice-commands" });
          break;

        // Controller requested the presenter window move/resize to a specific screen
        // and wait for the user to press Enter on *that* display (used when switching
        // the target display). The presenter will try to position itself, focus and
        // then register a one-time Enter handler which requests fullscreen and notifies
        // the controller when pressed.
        case "hold-for-enter": {
          const hintId = "smui-enter-hint";
          if (!document.getElementById(hintId)) {
            const el = document.createElement("div");
            el.id = hintId;
            el.textContent = "Press Enter to go fullscreen";
            Object.assign(el.style, {
              position: "fixed",
              left: "0",
              top: "0",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "black",
              borderRadius: "8px",
              zIndex: 9999,
              fontSize: "40px",
              fontFamily: "Inter",
              backgroundColor: "red",
            } as any);
            document.body.appendChild(el);
            setTimeout(() => {
              el.remove();
            }, 3000);
          }

          // One-time Enter listener (request fullscreen + notify controller)
          const onEnter = (ev: KeyboardEvent) => {
            if (ev.key !== "Enter") return;

            document.documentElement.requestFullscreen?.().catch(() => {});

            const w = window.opener || window.parent;
            if (w)
              w.postMessage(
                { type: "presenter-enter-pressed" },
                window.location.origin,
              );
          };

          window.addEventListener("keydown", onEnter, {
            once: true,
          } as AddEventListenerOptions);

          break;
        }
      }
    },
    [applyInit],
  );

  // postMessage -> existing hook
  useWindowMessages((data) => handleIncoming(data));

  React.useEffect(() => {
    const origin = window.location.origin;
    const id = window.setTimeout(() => {
      dispatch({ type: "ready" });
      try {
        (window.opener || window.parent)?.postMessage?.(
          { type: "presenter-ready" },
          origin,
        );
      } catch {}
    }, 50);
    return () => clearTimeout(id);
  }, []);

  // Notify controller when presenter unloads/closes so controller lifecycle remains accurate
  React.useEffect(() => {
    const notifyClosed = () => {
      try {
        (window.opener || window.parent)?.postMessage?.(
          { type: 'presenter-unload' },
          window.location.origin,
        );
      } catch (_) {}
    };
    window.addEventListener('beforeunload', notifyClosed);
    window.addEventListener('unload', notifyClosed);
    return () => {
      window.removeEventListener('beforeunload', notifyClosed);
      window.removeEventListener('unload', notifyClosed);
    };
  }, []);

  // Broadcast state changes back to controller
  React.useEffect(() => {
    if (!state.ready) return;
    try {
      const w = window.opener || window.parent;
      if (w) {
        w.postMessage(
          { type: "presenter-playing", playing: state.playing },
          window.location.origin,
        );
        w.postMessage(
          { type: "presenter-mic", active: state.mic },
          window.location.origin,
        );
        // Notify controller of wordIndex changes so the App can sync its UI/hook
        w.postMessage(
          { type: "presenter-word-index", index: state.wordIndex },
          window.location.origin,
        );
      }
    } catch (_) {}
  }, [state.playing, state.mic, state.wordIndex, state.ready]);

  React.useEffect(() => {
    if (!state.ready) return;
    try {
      window.focus?.();
    } catch (_) {}
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter")
        try {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } catch (_) {}
    };
    window.addEventListener("keydown", onKey, {
      once: true,
    } as AddEventListenerOptions);
    return () => window.removeEventListener("keydown", onKey as EventListener);
  }, [state.ready]);

  const appearance = state.payload.appearance || {};

  const tokens = useMemo(() => {
    return parseScriptToTokens(
      state.payload.doc || null,
      appearance.preserveFormatting || false,
    );
  }, [state.payload.doc, appearance.preserveFormatting]);

  // When the active chapter id changes (or a new doc loads) ensure the
  // presenter scrolls to the first word of that chapter by setting
  // the global wordIndex accordingly.
  React.useEffect(() => {
    try {
      const cid = state.currentChapterId;
      const doc = state.payload.doc ?? null;
      if (!cid || !doc) return;
      const tok = parseScriptToTokens(
        doc,
        appearance.preserveFormatting || false,
      );
      const first = tok.find((t) => t.isWord && t.id.startsWith(`${cid}-`));
      if (first && typeof first.index === "number" && first.index >= 0) {
        // only update when different to avoid unnecessary re-renders
        if (first.index !== state.wordIndex) {
          dispatch({ type: "set-word-index", index: first.index });
        }
      }
    } catch (_) {}
  }, [
    state.currentChapterId,
    state.payload.doc,
    appearance.preserveFormatting,
  ]);

  // --- Camera handling (presenter-side) ---
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const overlayVideoRef = React.useRef<HTMLVideoElement | null>(null);

  const streamRef = React.useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);

  // WebRTC: if presenter is opened with a hash (roomId), join signaling and answer offers
  React.useEffect(() => {
    const room = (location.hash || "").replace("#", "").trim();
    if (!room) return;

    let ws: WebSocket | null = null;
    let pc: RTCPeerConnection | null = null;

    function cleanup() {
      try {
        ws?.close();
      } catch (_) {}
      try {
        pc?.close();
      } catch (_) {}
      ws = null;
      pc = null;
    }

    (async () => {
      try {
        ws = new WebSocket(
          (location.protocol === "https:" ? "wss:" : "ws:") +
            "//" +
            location.host +
            "/ws",
        );
      } catch (err) {
        console.warn("[webrtc] ws open failed", err);
        return;
      }

      ws.addEventListener("open", () => {
        try {
          ws?.send(JSON.stringify({ type: "join", room }));
        } catch (_) {}
        console.log("[webrtc] joined room", room);
      });

      ws.addEventListener("message", async (ev) => {
        let msg: any = null;
        try {
          msg = JSON.parse(ev.data);
        } catch (_) {
          return;
        }

        // Offer from controller -> create pc, setRemote, createAnswer
        if (msg?.type === "offer" && typeof msg.sdp === "string") {
          try {
            if (!pc) {
              pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
              });

              pc.addEventListener("icecandidate", (e) => {
                if (!e.candidate) return;
                try {
                  ws?.send(
                    JSON.stringify({ type: "ice", candidate: e.candidate }),
                  );
                } catch (_) {}
              });

              pc.addEventListener("track", (t) => {
                const [s] = t.streams || [];
                console.log('[webrtc] incoming remote track (presenter) — streams:', (t.streams || []).length, 'track:', t.track?.kind);
                // no on-page preview in presenter; presenter doesn't render incoming video element
              });

              pc.addEventListener("datachannel", (ev2) => {
                const ch = ev2.channel;
                ch.onopen = () => console.log("[webrtc] datachannel open");
                ch.onmessage = (m) => console.log("[webrtc] dc rx", m.data);
              });
            }

            const offer = {
              type: "offer",
              sdp: msg.sdp,
            } as RTCSessionDescriptionInit;
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            try {
              ws?.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));
            } catch (_) {}
          } catch (err) {
            console.warn("[webrtc] handle offer failed", err);
          }
          return;
        }

        // remote ICE candidate from controller
        if (msg?.type === "ice" && msg.candidate) {
          try {
            pc?.addIceCandidate(msg.candidate).catch(() => {});
          } catch (_) {}
          return;
        }
      });

      ws.addEventListener("close", cleanup);
      window.addEventListener("beforeunload", cleanup);
    })();

    return () => {
      try {
        ws?.close();
      } catch (_) {}
      try {
        pc?.close();
      } catch (_) {}
    };
  }, []);
  React.useEffect(() => {
    let mounted = true;

    async function applyCamera(deviceId?: string | null) {
      // always stop any existing stream first
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      streamRef.current = null;

      // If overlay is hidden or not the 'camera' shape we do not open the camera (presenter shows only dummy visuals)
      if (!appearance.showOverlay || appearance.overlayShape !== "camera") {
        setCameraError(null);
        try {
          const w = window.opener || window.parent;
          if (w)
            w.postMessage(
              { type: "presenter-camera", active: false },
              window.location.origin,
            );
        } catch (_) {}
        return;
      }

      // no device selected -> nothing to do
      if (!deviceId) {
        setCameraError(null);
        try {
          const w = window.opener || window.parent;
          if (w)
            w.postMessage(
              { type: "presenter-camera", active: false },
              window.location.origin,
            );
        } catch (_) {}
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // attach to the large-background video (if present)
        if (videoRef.current) {
          try {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          } catch (_) {
            /* ignore */
          }
        }
        // also attach to the overlay badge video (if present) so the small
        // movable badge shows the live feed when overlayShape === 'camera'
        if (overlayVideoRef.current) {
          try {
            overlayVideoRef.current.srcObject = stream;
            await overlayVideoRef.current.play();
          } catch (_) {
            /* ignore */
          }
        }

        setCameraError(null);
        try {
          const w = window.opener || window.parent;
          if (w)
            w.postMessage(
              { type: "presenter-camera", active: true },
              window.location.origin,
            );
        } catch (_) {}
      } catch (err: any) {
        const msg = String(err?.message ?? err ?? "Camera error");
        setCameraError(msg);
        try {
          const w = window.opener || window.parent;
          if (w)
            w.postMessage(
              { type: "presenter-camera", active: false, error: msg },
              window.location.origin,
            );
        } catch (_) {}
      }
    }

    applyCamera(appearance.videoDeviceId ?? null);
    return () => {
      mounted = false;
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      streamRef.current = null;
      try {
        if (overlayVideoRef.current) overlayVideoRef.current.srcObject = null;
      } catch (_) {}
    };
  }, [
    appearance.videoDeviceId,
    appearance.showOverlay,
    appearance.overlayShape,
  ]);

  const rootStyle: React.CSSProperties = {
    width: "100vw",
    height: "100vh",
    background: "#000",
    overflowY: "auto",
    overflowX: "hidden",
    transformOrigin: "center center",
    transform: [
      appearance.mirrorMode ? "scaleX(-1)" : "",
      appearance.rotateScreen ? "rotate(90deg)" : "",
    ].join(" "),
    // Firefox / modern browsers
    scrollbarWidth: "thin",
    scrollbarColor: "transparent transparent",
    // IE/Edge legacy
    msOverflowStyle: "none",
  };

  // Inject WebKit scrollbar rules (cannot be done via inline styles)
  React.useEffect(() => {
    const id = "presenter-scrollbar-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
        /* Make scrollbars visually transparent but keep hit-targets */
        #presenter-root, #root, .prompter-content {
            -webkit-overflow-scrolling: touch;
        }
        #presenter-root::-webkit-scrollbar,
        #root::-webkit-scrollbar,
        .prompter-content::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }
        #presenter-root::-webkit-scrollbar-thumb,
        #root::-webkit-scrollbar-thumb,
        .prompter-content::-webkit-scrollbar-thumb {
            background: transparent;
        }
        #presenter-root::-webkit-scrollbar-track,
        #root::-webkit-scrollbar-track,
        .prompter-content::-webkit-scrollbar-track {
            background: transparent;
        }
        /* When you truly want no visuals and no hit area, set display:none */
    `;
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return (
    <div style={rootStyle} className={appearance.mirrorMode ? "mirror" : ""}>
      {/* hidden focus anchor used by focus-keepalive (tabIndex allows programmatic focus) */}
      <div id="presenter-focus-anchor" tabIndex={-1} aria-hidden style={{position: 'fixed', left: '-9999px', width: 1, height: 1, overflow: 'hidden'}} />
      {/* Centerline (subtle + prominent) — visibility and height controlled by appearance */}
      {appearance.showCenterline !== false && (
        <>
          <div
            aria-hidden
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              top: `${Math.max(10, Math.min(90, appearance.activeLinePosition ?? 35))}%`,
              height: 1,
              transform: "translateY(-0.5px)",
              background: appearance.highlightActiveWord
                ? "rgba(255, 255, 0, 0.12)"
                : "rgba(255,255,255,0.06)",
              pointerEvents: "none",
              zIndex: 3,
              mixBlendMode: "overlay",
            }}
          />

          <div
            aria-hidden
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              top: `${Math.max(10, Math.min(90, appearance.activeLinePosition ?? 35))}%`,
              height: `${appearance.activeLineGuideHeight ?? 2}px`,
              transform: `translateY(-${(appearance.activeLineGuideHeight ?? 2) / 2}px)`,
              background: "rgba(239,255,255,0.3)",
              pointerEvents: "none",
              zIndex: 4,
              boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
            }}
          />
        </>
      )}

      {/* Camera background (fixed, centered, rear) — only active when overlay is visible, a device is selected, and the overlay shape is 'camera' */}
      {appearance.videoDeviceId &&
      appearance.showOverlay &&
      appearance.overlayShape === "camera" ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(90vw, 100vw)",
              height: "min(90vh, 100vh)",
              maxHeight: "100vh",
              overflow: "hidden",
              borderRadius: 8,
              boxShadow: "0 6px 30px rgba(0,0,0,0.6)",
              transform: appearance.mirrorMode ? "scaleX(-1)" : undefined,
              background: "#070707",
            }}
          >
            {cameraError ? (
              <div
                style={{
                  color: "#fecaca",
                  padding: 12,
                  fontSize: 13,
                  position: "absolute",
                  left: 12,
                  top: 12,
                  zIndex: 2,
                }}
              >
                {cameraError}
              </div>
            ) : (
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  width: "100%",

                  objectFit: "cover",
                  display: "block",
                }}
              />
            )}

            {/* subtle dark overlay so text remains readable over the video */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.28))",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* incoming WebRTC stream (controller -> presenter) */}


      <button
        onClick={async () => {
          try {
            const roomId = Math.random().toString(36).slice(2, 9);
            
            // Step 1: Create WebSocket and wait for connection
            const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws');
            await new Promise((res) => { 
              ws.addEventListener('open', () => res(null)); 
              setTimeout(() => res(null), 500); 
            });
            console.log('[presenter] WebSocket connected');

            // Step 2: Join room FIRST (before inviting phone)
            try { 
              ws.send(JSON.stringify({ type: 'join', room: roomId })); 
              console.log('[presenter] Joined room:', roomId);
            } catch (_) {}

            // Step 3: NOW send invite to phone (presenter is already waiting in room)
            try {
              (window.opener || window.parent)?.postMessage(
                { type: 'presenter-share-invite', room: roomId },
                window.location.origin,
              );
              console.log('[presenter] Sent invite to phone');
            } catch (_) {}

            // Step 4: Wait for phone to join (peer-joined message) — fallback after 1.5s
            await new Promise<void>((resolve) => {
              let finished = false;
              const timer = window.setTimeout(() => {
                if (!finished) {
                  finished = true;
                  console.log('[presenter] Timeout waiting for peer, proceeding anyway');
                  resolve();
                }
              }, 1500);

              const onMessage = (ev: MessageEvent) => {
                try {
                  const m = JSON.parse(ev.data);
                  if (m?.type === 'peer-joined') {
                    if (!finished) {
                      finished = true;
                      window.clearTimeout(timer);
                      console.log('[presenter] Phone joined!');
                      resolve();
                    }
                  }
                } catch (_) {}
              };

              ws.addEventListener('message', onMessage, { once: false } as any);
            });

            // Step 5: Get display stream
            const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
            console.log('[presenter] Got display stream');

            const pc = new RTCPeerConnection({ 
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
              ] 
            });

            let pendingIceCandidates: RTCIceCandidate[] = [];
            let _focusKeepalive: number | null = null;

            function startFocusKeepAlive() {
              try {
                if (_focusKeepalive) return;
                _focusKeepalive = window.setInterval(() => {
                  try {
                    // Prefer focusing a hidden focusable anchor (more reliable than window.focus)
                    const anchor = document.getElementById('presenter-focus-anchor') as HTMLElement | null;
                    window.focus?.();
                    if (anchor) {
                      try { anchor.focus({ preventScroll: true } as any); } catch (_) {}
                    }
                    // Fallback to window.focus
                    if (!document.hasFocus()) try { window.focus(); } catch (_) {}
                  } catch (_) {}
                }, 1000);

                document.addEventListener('visibilitychange', onVisibilityChange);
                console.log('[presenter] focus-keepalive started');
              } catch (_) {}
            }

            function stopFocusKeepAlive() {
              try {
                if (_focusKeepalive) {
                  clearInterval(_focusKeepalive);
                  _focusKeepalive = null;
                }
                document.removeEventListener('visibilitychange', onVisibilityChange);
                console.log('[presenter] focus-keepalive stopped');
              } catch (_) {}
            }

            function onVisibilityChange() {
              try {
                if (document.hidden) window.focus();
              } catch (_) {}
            }

            pc.addEventListener('icecandidate', (e) => {
              if (!e.candidate) return;
              try { 
                ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate, room: roomId })); 
                console.log('[presenter] sent ICE candidate');
              } catch (_) {}
            });

            pc.addEventListener('connectionstatechange', () => {
              console.log('[presenter] PC state:', pc.connectionState);
              if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                stopFocusKeepAlive();
              }
            });

            for (const t of displayStream.getTracks()) {
              pc.addTrack(t, displayStream);
              console.log('[presenter] added track:', t.kind, t.id);
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log('[presenter] created offer, sending...');
            try { ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp, room: roomId })); } catch (_) {}

            // start keeping the presenter focused while we are streaming
            startFocusKeepAlive();

            const onWsMessage = (ev: MessageEvent) => {
              try {
                const msg = JSON.parse(ev.data);

                if (msg?.type === 'answer' && msg.sdp) {
                  console.log('[presenter] received answer');
                  pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp } as RTCSessionDescriptionInit)
                    .then(() => {
                      console.log('[presenter] setRemoteDescription OK, draining ICE candidates');
                      while (pendingIceCandidates.length) {
                        const c = pendingIceCandidates.shift();
                        if (c) pc.addIceCandidate(c).catch(() => {});
                      }
                    })
                    .catch((e) => console.warn('[presenter] setRemoteDescription failed:', e));
                  return;
                }

                if (msg?.type === 'ice' && msg.candidate) {
                  // Queue if no remoteDescription yet
                  if (!pc.remoteDescription || !pc.remoteDescription.type) {
                    pendingIceCandidates.push(msg.candidate);
                    console.log('[presenter] queued ICE candidate (count:', pendingIceCandidates.length, ')');
                  } else {
                    pc.addIceCandidate(msg.candidate).catch(() => {});
                    console.log('[presenter] added remote ICE candidate');
                  }
                  return;
                }
              } catch (_) {}
            };

            ws.addEventListener('message', onWsMessage);

            const cleanup = () => {
              try { ws.removeEventListener('message', onWsMessage); } catch (_) {}
              try { pc.close(); } catch (_) {}
              try { displayStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (_) {}
              try { stopFocusKeepAlive(); } catch (_) {}
            };
            window.addEventListener('beforeunload', cleanup, { once: true });
          } catch (err) {
            console.warn('Screen-share to paired phone failed', err);
            alert('Failed to start screen-share');
          }
        }}
        style={{ position: "fixed", right: 12, top: 12, zIndex: 40, backgroundColor: "black", appearance: "none", border: "none", padding: 8, borderRadius: 4, color: "white", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
        title="Stream this presenter to paired phone"
      >
        <Icon name="screencast" width={18} title="Casting" />
      </button>

      <PrompterView
        tokens={tokens}
        activeIndex={state.wordIndex}
        appearance={appearance}
        onWordClick={(idx) => dispatch({ type: "set-word-index", index: idx })}
      />

      {/* Presenter overlay (driven by appearance.overlay*) — use simple dummy SVGs (keeps Sidebar PositionPreview unchanged) */}
      {appearance.showOverlay ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: `${appearance.overlayPosX ?? 50}%`,
            top: `${appearance.overlayPosY ?? 60}%`,
            transform: "translate(-50%,-50%)",
            zIndex: 6,
            pointerEvents: "none",
          }}
        >
          {(() => {
            const op = Math.max(
              0,
              Math.min(1, Number(appearance.overlayOpacity ?? 80) / 100),
            );
            const c = appearance.overlayColor || "#2563eb";
            const shape = appearance.overlayShape || "snap";

            const svgProps = {
              width: 200,
              height: 200,
              style: { display: "block", opacity: op },
            } as any;

            switch (shape) {
              case "circle":
                return (
                  <svg {...svgProps} viewBox="0 0 512 512" aria-hidden>
                    <path
                      d="M256 0C114.84 0 0 114.84 0 256s114.84 256 256 256 256-114.84 256-256S397.16 0 256 0zm-9.88 491.285C123.24 486.05 25.953 388.77 20.717 265.89H246.12v225.395zm0-245.875H20.717C25.953 125.09 123.24 25.95 246.12 20.715V245.41zM266.6 20.715C386.92 25.95 486.05 125.09 491.285 245.41H266.6V20.715zm0 470.57V265.89h224.685C486.05 388.77 386.92 486.05 266.6 491.285z"
                      fill={c}
                    ></path>
                  </svg>
                );
              case "square":
                return (
                  <svg {...svgProps} viewBox="0 0 480 480" aria-hidden>
                    <path
                      d="M155.024 0H16C7.152 0 0 7.152 0 16v128c0 8.848 7.152 16 16 16s16-7.152 16-16V32h123.024c8.848 0 16-7.152 16-16s-7.152-16-16-16zM155.024 448H32V336c0-8.848-7.152-16-16-16s-16 7.152-16 16v128c0 8.848 7.152 16 16 16h139.024c8.848 0 16-7.152 16-16 0-8.848-7.152-16-16-16zM464 0H355.856c-8.848 0-16 7.152-16 16s7.152 16 16 16H448v112c0 8.848 7.152 16 16 16 8.848 0 16-7.152 16-16V16c0-8.848-7.152-16-16-16zM464 320c-8.848 0-16 7.152-16 16v112h-92.144c-8.848 0-16 7.152-16 16 0 8.848 7.152 16 16 16H464c8.848 0 16-7.152 16-16V336c0-8.848-7.152-16-16-16z"
                      fill={c}
                    ></path>
                  </svg>
                );
              case "cross":
                return (
                  <svg {...svgProps} viewBox="0 0 64 64" aria-hidden>
                    <path
                      d="M32 26a6 6 0 1 0 6 6 6.006 6.006 0 0 0-6-6zm0 8a2 2 0 1 1 2-2 2 2 0 0 1-2 2zM20 30H2a2 2 0 0 0 0 4h18a2 2 0 0 0 0-4zM62 30H44a2 2 0 0 0 0 4h18a2 2 0 0 0 0-4zM32 42a2 2 0 0 0-2 2v18a2 2 0 0 0 4 0V44a2 2 0 0 0-2-2zM32 22a2 2 0 0 0 2-2V2a2 2 0 0 0-4 0v18a2 2 0 0 0 2 2z"
                      fill={c}
                      opacity="1"
                      data-original="#000000"
                    ></path>
                  </svg>
                );
              case "camera": {
                return <div></div>;
              }
              case "snap":
              default:
                return (
                  <svg {...svgProps} viewBox="0 0 32 32">
                    <g>
                      <path
                        d="M5 11a1 1 0 0 0 1-1V6h4a1 1 0 0 0 0-2H6c-1.103 0-2 .897-2 2v4a1 1 0 0 0 1 1zM6 28h4a1 1 0 0 0 0-2H6v-4a1 1 0 0 0-2 0v4c0 1.103.897 2 2 2zM27 21a1 1 0 0 0-1 1v4h-4a1 1 0 0 0 0 2h4c1.103 0 2-.897 2-2v-4a1 1 0 0 0-1-1zM26 4h-4a1 1 0 0 0 0 2h4v4a1 1 0 0 0 2 0V6c0-1.103-.897-2-2-2zM13 17h2v2a1 1 0 0 0 2 0v-2h2a1 1 0 0 0 0-2h-2v-2a1 1 0 0 0-2 0v2h-2a1 1 0 0 0 0 2z"
                        fill={c}
                        strokeWidth={0}
                      ></path>
                    </g>
                  </svg>
                );
            }
          })()}
        </div>
      ) : null}
    </div>
  );
}

// mount
const rootEl = document.getElementById("presenter-root");
if (rootEl) {
  createRoot(rootEl).render(<Presenter />);
}

export default Presenter;
