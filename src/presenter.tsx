import React, { useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useWindowMessages } from "./lib/window-message";
import Icon from "./components/ui/Icon";
import { PRESENTER_PAIR_ID } from "./lib/keys";
import { getScreenStream } from "./lib/media-devices";
import type { PresenterMessage } from "./lib/presenter-transport";

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

  // overlay controls
  showOverlay?: boolean;
  overlayShape?: "circle" | "cross" | "snap" | "square";
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
  const tokens: Token[] = [];
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
    case "set-chapter": {
      const cid = action.chapterId ?? null;
      let nextWordIndex = 0;
      const doc = state.payload.doc;
      if (cid && doc) {
        const tokens = parseScriptToTokens(
          doc,
          Boolean(state.payload.appearance?.preserveFormatting),
        );
        const first = tokens.find((t) => t.isWord && t.id.startsWith(`${cid}-`));
        if (first && typeof first.index === "number" && first.index >= 0) {
          nextWordIndex = first.index;
        }
      }
      return {
        ...state,
        currentChapterId: cid,
        wordIndex: nextWordIndex,
      };
    }
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
        : ({ top: 0, height: window.innerHeight } as { top: number; height: number });
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
      const targetScrollTop = Math.max(
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

      el.scrollIntoView({
        behavior: appearance.smoothAnimations ? "smooth" : "auto",
        block: "center",
        inline: "nearest",
      });
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
          const opacity = 1;

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

export function usePresenterParams() {
  return useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      display: p.get("display"),
      mirror: p.get("mirror") === "true",
      font: p.get("font") ?? "inter",
      transport: p.get("transport") ?? null,
    };
  }, []);
}

function Presenter() {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const applyInit = React.useCallback((incoming: InitPayload) => {
    dispatch({ type: "init", incoming: incoming || {} });
  }, []);

  // transport params & signaling WS ref (used when presenter opened with ?transport=ws#room)
  const presenterParams = usePresenterParams();
  const signalingWsRef = React.useRef<WebSocket | null>(null);
  // Retry helpers used when `get-state` returns an empty cached state — the
  // presenter will re-issue `get-state` + `request-state` a few times with a
  // short backoff so late-joining controllers can seed the room reliably.
  const stateRetryTimerRef = React.useRef<number | null>(null);
  const stateRetryAttemptsRef = React.useRef(0);
  const MAX_STATE_REQUEST_RETRIES = 6;

  const sendToController = React.useCallback((msg: PresenterMessage) => {
    const origin = window.location.origin;
    const room = (location.hash || "").replace("#", "").trim();

    // WS transport: forward as a `signal` to the signaling server + room
    if (presenterParams.transport === "ws") {
      const ws = signalingWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && room) {
        try {
          ws.send(JSON.stringify({ type: "signal", room, data: msg }));
          return true;
        } catch (_) {
          return false;
        }
      }
    }

    // Fallback to postMessage for local controller
    const w = window.opener || window.parent;
    if (w && typeof (w as Window).postMessage === "function") {
      (w as Window).postMessage(msg, origin);
      return true;
    }
    return false;
  }, [presenterParams.transport]);

  // Provide a single message handler that works for both postMessage and WS-sourced messages
  const handleIncoming = React.useCallback(
    async (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const type = (data as Record<string, unknown>)["type"];
      if (typeof type !== "string") return;
      const msg = data as PresenterMessage;
      const raw = msg as unknown as Record<string, unknown>;

      console.log("[Presenter] handleIncoming:", msg.type, msg);
      dispatch({ type: "cmd", cmd: msg.type });

      switch (msg.type) {
        case "set-params":
        case "presenter-init":
          console.log("[Presenter] Applying init data:", data);
          applyInit(data);
          break;
        case "presenter-load-doc":
          const incomingDoc = raw.doc as Record<string, unknown> | undefined;
          console.log(
            "[Presenter] Loading doc:",
            incomingDoc?.name ?? "unknown",
            "chapters:",
            (incomingDoc?.chapters as unknown[] | undefined)?.length ?? 0,
          );
          if (incomingDoc) dispatch({ type: "load-doc", doc: incomingDoc as unknown as ScriptDocShape });
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
          dispatch({ type: "set-word-index", index: Number(raw.index ?? 0) });
          break;
        case "presenter-goto-chapter": {
          const cid = typeof (raw.chapterId as unknown) === "string" ? String(raw.chapterId) : null;

          // inform controller that the chapter was applied
          // we use state.payload.doc directly; if this arrives exactly at the same time as load-doc
          // it might be slightly stale for this telemetry message, but the reducer
          // will have handled the actual state correctly.
          sendToController({
            type: "presenter-chapter-loaded",
            docId: state.payload.doc?.id ?? null,
            chapterId: cid,
          });

          break;
        }
        case "presenter-playing":
          if (Boolean(raw.playing)) dispatch({ type: "play" });
          else dispatch({ type: "pause" });
          break;
        case "presenter-mic":
          dispatch({ type: "set-mic", active: Boolean(raw.active) });
          break;
        case "presenter-voice-commands":
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
              zIndex: "9999",
              fontSize: "40px",
              fontFamily: "Inter",
              backgroundColor: "red",
            } as Partial<CSSStyleDeclaration>);
            document.body.appendChild(el);
            setTimeout(() => {
              el.remove();
            }, 3000);
          }

          // One-time Enter listener (request fullscreen + notify controller)
          const onEnter = (ev: KeyboardEvent) => {
            if (ev.key !== "Enter") return;

            document.documentElement.requestFullscreen?.().catch(() => {});

            sendToController({ type: "presenter-enter-pressed" });
          };

          window.addEventListener("keydown", onEnter, {
            once: true,
          } as AddEventListenerOptions);

          break;
        }
      }
    },
    [applyInit, state.payload.doc, state.payload.appearance],
  );

  // Use a ref to ensure event listeners always call the latest version of handleIncoming
  // with the latest state captured via dependencies above.
  const handleIncomingRef = React.useRef(handleIncoming);
  React.useEffect(() => {
    handleIncomingRef.current = handleIncoming;
  }, [handleIncoming]);

  // postMessage -> existing hook
  useWindowMessages((data) => handleIncomingRef.current(data));

  React.useEffect(() => {
    const origin = window.location.origin;
    const id = window.setTimeout(() => {
      dispatch({ type: "ready" });

      sendToController({ type: "presenter-ready" });
    }, 50);
    return () => clearTimeout(id);
  }, []);

  // Notify controller when presenter unloads/closes so controller lifecycle remains accurate
  React.useEffect(() => {
    const notifyClosed = () => {
      sendToController({ type: "presenter-unload" });
    };
    window.addEventListener("beforeunload", notifyClosed);
    window.addEventListener("unload", notifyClosed);
    return () => {
      window.removeEventListener("beforeunload", notifyClosed);
      window.removeEventListener("unload", notifyClosed);
    };
  }, []);

  // Broadcast state changes back to controller
  React.useEffect(() => {
    if (!state.ready) return;

    sendToController({ type: "presenter-playing", playing: state.playing });
    sendToController({ type: "presenter-mic", active: state.mic });
    // Notify controller of wordIndex changes so the App can sync its UI/hook
    sendToController({ type: "presenter-word-index", index: state.wordIndex });
  }, [state.playing, state.mic, state.wordIndex, state.ready]);

  React.useEffect(() => {
    if (!state.ready) return;

    window.focus?.();

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter")
        document.documentElement.requestFullscreen?.().catch(() => {});
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

  // WebRTC: if presenter is opened with a hash (roomId), join signaling and answer offers
  React.useEffect(() => {
    const DEFAULT_WS_ROOM = "smui-default";

    let room = (location.hash || "").replace("#", "").trim();
    if (!room && presenterParams.transport === "ws") room = DEFAULT_WS_ROOM;
    if (!room) return;

    let ws: WebSocket | null = null;
    let pc: RTCPeerConnection | null = null;

    function cleanup() {
      ws?.close();

      pc?.close();

      // clear any pending state-retry timers
      if (stateRetryTimerRef.current) {
        window.clearInterval(stateRetryTimerRef.current);
        stateRetryTimerRef.current = null;
        stateRetryAttemptsRef.current = 0;
      }

      signalingWsRef.current = null;
      ws = null;
      pc = null;
    }

    // use a reconnecting WS connection (connect() will be invoked below)
    let stopped = false;
    let reconnectAttempts = 0;
    let reconnectTimer: number | null = null;

    const scheduleReconnect = () => {
      if (stopped) return;
      reconnectAttempts += 1;
      const delay = Math.min(1000 * Math.pow(2, Math.max(0, reconnectAttempts - 1)), 30000);

      reconnectTimer = window.setTimeout(() => connect(), delay) as unknown as number;
    };

    function connect() {
      ws = new WebSocket(
        (location.protocol === "https:" ? "wss:" : "ws:") +
          "//" +
          location.host +
          "/ws",
      );

      // expose signaling WS so presenter can send control signals back to controller
      signalingWsRef.current = ws;

      ws.addEventListener("open", () => {
        ws?.send(JSON.stringify({ type: "join", room }));
        // explicitly request cached room state so late-join presenters always receive doc/appearance/state
        try {
          ws?.send(JSON.stringify({ type: "get-state", room }));
        } catch (err) {
          /* ignore */
        }

        // If presenter was opened independently (no window.opener), announce ourselves
        // so controller / Composer can show this remote presenter as a device. Persist
        // the pair id so reconnects announce the same device id.
        try {
          if (!window.opener) {
            const storageKey = PRESENTER_PAIR_ID;
            let id: string | null = null;
            try {
              id = localStorage.getItem(storageKey);
            } catch (_) {
              id = null;
            }

            if (!id) {
              id = `presenter-${Math.random().toString(36).slice(2, 8)}`;
              try {
                localStorage.setItem(storageKey, id);
              } catch (_) {
                /* ignore */
              }
            }

            const payload: Record<string, unknown> = {
              type: "pair-request",
              id,
              info: {
                ua: navigator.userAgent,
                screen: { width: window.screen?.width || 0, height: window.screen?.height || 0 },
                origin: "presenter",
              },
            };

            ws?.send(JSON.stringify(payload));
            try { window.__smui_presenterPairId = id; } catch (_) {}

          }
        } catch (_) {
          /* ignore */
        }

        console.log("[webrtc] joined room", room);
      });

      ws.addEventListener("message", async (ev) => {
        let msg: any = null;
        try {
          msg = JSON.parse(ev.data);
        } catch (_) {
          return;
        }

        console.log("[Presenter WS] message received:", msg?.type, msg);

        // Control signal delivered via signaling server -> treat as presenter message
        if (msg?.type === "signal" && msg.data) {
          // controller probe -> re-announce pair (helps controller reloads)
          try {
            if (msg.data?.type === "presenter-probe") {
              const storageKey = PRESENTER_PAIR_ID;
              let id: string | null = null;
              try { id = localStorage.getItem(storageKey); } catch (_) { id = null; }
              if (!id) {
                id = `presenter-${Math.random().toString(36).slice(2, 8)}`;
                try { localStorage.setItem(storageKey, id); } catch (_) {}
              }
              const payload: Record<string, unknown> = { type: "pair-request", id, info: { ua: navigator.userAgent, screen: { width: window.screen?.width || 0, height: window.screen?.height || 0 }, origin: "presenter" } };
              try { ws?.send(JSON.stringify(payload)); } catch (_) {}

              return;
            }
          } catch (_) {
            /* ignore */
          }

          console.log(
            "[Presenter WS] signal detected, processing data:",
            msg.data.type,
          );
          try {
            handleIncomingRef.current(msg.data);
          } catch (err) {
            console.warn("[webrtc] failed to handle incoming signal", err);
          }
          return;
        }

        // Cached room state (seed late joiners)
        if (msg?.type === "state" && (msg as Record<string, unknown>).data) {
          const d = ((msg as Record<string, unknown>)?.data) as Record<string, unknown> | undefined;
          if (d?.payload) applyInit(d.payload as InitPayload);
          if (d?.currentChapterId) dispatch({ type: "set-chapter", chapterId: String(d.currentChapterId) });
          if (typeof d?.playing === "boolean") dispatch({ type: d!.playing ? "play" : "pause" });
          if (typeof d?.mic === "boolean") dispatch({ type: "set-mic", active: Boolean(d!.mic) });
          if (typeof d?.wordIndex === "number") dispatch({ type: "set-word-index", index: Number(d!.wordIndex) });

          // If cached state is missing critical bits (doc/appearance), ask controller to re-send
          const missingDoc = !d?.payload || !((d.payload as Record<string, unknown>)?.doc);
          const missingAppearance = !d?.payload || !((d.payload as Record<string, unknown>)?.appearance);
          if (missingDoc || missingAppearance) {
            // immediate single request
            try {
              ws?.send(JSON.stringify({ type: "signal", room, data: { type: "request-state" } }));
              console.log("[webrtc] requested missing state from controller (request-state)");
            } catch (_) {
              /* ignore */
            }

            // start a short retry loop that re-issues get-state + request-state
            if (stateRetryTimerRef.current == null) {
              stateRetryAttemptsRef.current = 0;
              stateRetryTimerRef.current = window.setInterval(() => {
                stateRetryAttemptsRef.current++;
                try {
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "get-state", room }));
                    ws.send(JSON.stringify({ type: "signal", room, data: { type: "request-state" } }));
                    console.log(`[webrtc] retrying get-state/request-state (attempt ${stateRetryAttemptsRef.current})`);
                  }
                } catch (_) {}

                if (stateRetryAttemptsRef.current >= MAX_STATE_REQUEST_RETRIES) {
                  if (stateRetryTimerRef.current) {
                    window.clearInterval(stateRetryTimerRef.current);
                    stateRetryTimerRef.current = null;
                  }
                }
              }, 750);
            }
          } else {
            // we have doc + appearance — stop retry loop (if running)
            if (stateRetryTimerRef.current) {
              window.clearInterval(stateRetryTimerRef.current);
              stateRetryTimerRef.current = null;
            }
            stateRetryAttemptsRef.current = 0;
          }

          return;
        }

        // Offer from controller -> create pc, setRemote, createAnswer
        if (msg?.type === "offer" && typeof msg.sdp === "string") {
          if (!pc) {
            pc = new RTCPeerConnection({
              iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });

            pc.addEventListener("icecandidate", (e) => {
              if (!e.candidate) return;

              ws?.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
            });

            pc.addEventListener("track", (t) => {
              const [s] = t.streams || [];
              console.log(
                "[webrtc] incoming remote track (presenter) — streams:",
                (t.streams || []).length,
                "track:",
                t.track?.kind,
              );
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

          ws?.send(JSON.stringify({ type: "answer", sdp: answer.sdp }));

          return;
        }

        // remote ICE candidate from controller
        if (msg?.type === "ice" && msg.candidate) {
          pc?.addIceCandidate(msg.candidate).catch(() => {});

          return;
        }
      });

      ws.addEventListener("close", (ev) => {

        cleanup();
        if (!stopped) scheduleReconnect();
      });
      window.addEventListener("beforeunload", cleanup);
    }

    // start first connection
    connect();

    return () => {
      // stop reconnect attempts and clear any scheduled retry
      stopped = true;
      if (typeof reconnectTimer === "number") {
        clearTimeout(reconnectTimer as unknown as number);
        reconnectTimer = null;
      }

      // remove global unload handler registered above
      window.removeEventListener("beforeunload", cleanup);

      // clear any pending state-retry timers
      if (stateRetryTimerRef.current) {
        window.clearInterval(stateRetryTimerRef.current);
        stateRetryTimerRef.current = null;
        stateRetryAttemptsRef.current = 0;
      }

      ws?.close();

      pc?.close();
    };
  }, []);
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

        /* pseudo-fullscreen (iOS fallback) */
        .smui-pseudo-fullscreen {
          height: 100vh !important;
          width: 100vw !important;
          overflow: hidden !important;
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          background: #000 !important;
        }
        .smui-pseudo-fullscreen #presenter-root-content {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          overflow: hidden !important;
        }

    `;
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  const [pseudoFsActive, setPseudoFsActive] = React.useState(false);
  const isIos = typeof navigator !== "undefined" && /iP(ad|hone|od)/i.test(navigator.userAgent) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);

  React.useEffect(() => {
    if (pseudoFsActive) document.documentElement.classList.add("smui-pseudo-fullscreen");
    else document.documentElement.classList.remove("smui-pseudo-fullscreen");
    return () => document.documentElement.classList.remove("smui-pseudo-fullscreen");
  }, [pseudoFsActive]);

  return (
    <div id="presenter-root-content" style={rootStyle} className={appearance.mirrorMode ? "mirror" : ""}>
      {/* hidden focus anchor used by focus-keepalive (tabIndex allows programmatic focus) */}
      <div
        id="presenter-focus-anchor"
        tabIndex={-1}
        aria-hidden
        style={{
          position: "fixed",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      />
     

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

      {/* incoming WebRTC stream (controller -> presenter) */}

      <button
        onClick={async () => {
          try {
            const roomId = "smui-default";

            // Step 1: Create WebSocket and wait for connection
            const ws = new WebSocket(
              (location.protocol === "https:" ? "wss:" : "ws:") +
                "//" +
                location.host +
                "/ws",
            );
            await new Promise((res) => {
              ws.addEventListener("open", () => res(null));
              setTimeout(() => res(null), 500);
            });
            console.log("[presenter] WebSocket connected");

            // Step 2: Join room FIRST (before inviting phone)

            ws.send(JSON.stringify({ type: "join", room: roomId }));
            console.log("[presenter] Joined room:", roomId);

            // Step 3: NOW send invite to phone (presenter is already waiting in room)

            sendToController({ type: "presenter-share-invite", room: roomId });
            console.log("[presenter] Sent invite to phone");

            // Step 4: Wait for phone to join (peer-joined message) — fallback after 1.5s
            await new Promise<void>((resolve) => {
              let finished = false;
              const timer = window.setTimeout(() => {
                if (!finished) {
                  finished = true;
                  console.log(
                    "[presenter] Timeout waiting for peer, proceeding anyway",
                  );
                  resolve();
                }
              }, 1500);

              const onMessage = (ev: MessageEvent) => {
                const m = JSON.parse(ev.data);
                if (m?.type === "peer-joined") {
                  if (!finished) {
                    finished = true;
                    window.clearTimeout(timer);
                    console.log("[presenter] Phone joined!");
                    resolve();
                  }
                }
              };

              ws.addEventListener("message", onMessage);
            });

            // Step 5: Get display stream
            const displayStream = await getScreenStream();
            console.log("[presenter] Got display stream");

            const pc = new RTCPeerConnection({
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                  urls: "turn:openrelay.metered.ca:80",
                  username: "openrelayproject",
                  credential: "openrelayproject",
                },
                {
                  urls: "turn:openrelay.metered.ca:443",
                  username: "openrelayproject",
                  credential: "openrelayproject",
                },
                {
                  urls: "turn:openrelay.metered.ca:443?transport=tcp",
                  username: "openrelayproject",
                  credential: "openrelayproject",
                },
              ],
            });

            const pendingIceCandidates: RTCIceCandidate[] = [];
            let _focusKeepalive: number | null = null;

            function startFocusKeepAlive() {
              if (_focusKeepalive) return;
              _focusKeepalive = window.setInterval(() => {
                // Prefer focusing a hidden focusable anchor (more reliable than window.focus)
                const anchor = document.getElementById(
                  "presenter-focus-anchor",
                ) as HTMLElement | null;
                window.focus?.();
                if (anchor) {
                  anchor.focus({ preventScroll: true });
                }
                // Fallback to window.focus
                if (!document.hasFocus()) window.focus();
              }, 1000);

              document.addEventListener("visibilitychange", onVisibilityChange);
              console.log("[presenter] focus-keepalive started");
            }

            function stopFocusKeepAlive() {
              if (_focusKeepalive) {
                clearInterval(_focusKeepalive);
                _focusKeepalive = null;
              }
              document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
              );
              console.log("[presenter] focus-keepalive stopped");
            }

            function onVisibilityChange() {
              if (document.hidden) window.focus();
            }

            pc.addEventListener("icecandidate", (e) => {
              if (!e.candidate) return;

              ws.send(
                JSON.stringify({
                  type: "ice",
                  candidate: e.candidate,
                  room: roomId,
                }),
              );
              console.log("[presenter] sent ICE candidate");
            });

            pc.addEventListener("connectionstatechange", () => {
              console.log("[presenter] PC state:", pc.connectionState);
              if (
                pc.connectionState === "disconnected" ||
                pc.connectionState === "closed" ||
                pc.connectionState === "failed"
              ) {
                stopFocusKeepAlive();
              }
            });

            for (const t of displayStream.getTracks()) {
              pc.addTrack(t, displayStream);
              console.log("[presenter] added track:", t.kind, t.id);
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("[presenter] created offer, sending...");

            ws.send(
              JSON.stringify({ type: "offer", sdp: offer.sdp, room: roomId }),
            );

            // start keeping the presenter focused while we are streaming
            startFocusKeepAlive();

            const onWsMessage = (ev: MessageEvent) => {
              const msg = JSON.parse(ev.data);

              if (msg?.type === "answer" && msg.sdp) {
                console.log("[presenter] received answer");
                pc.setRemoteDescription({
                  type: "answer",
                  sdp: msg.sdp,
                } as RTCSessionDescriptionInit)
                  .then(() => {
                    console.log(
                      "[presenter] setRemoteDescription OK, draining ICE candidates",
                    );
                    while (pendingIceCandidates.length) {
                      const c = pendingIceCandidates.shift();
                      if (c) pc.addIceCandidate(c).catch(() => {});
                    }
                  })
                  .catch((e) =>
                    console.warn("[presenter] setRemoteDescription failed:", e),
                  );
                return;
              }

              if (msg?.type === "ice" && msg.candidate) {
                // Queue if no remoteDescription yet
                if (!pc.remoteDescription || !pc.remoteDescription.type) {
                  pendingIceCandidates.push(msg.candidate);
                  console.log(
                    "[presenter] queued ICE candidate (count:",
                    pendingIceCandidates.length,
                    ")",
                  );
                } else {
                  pc.addIceCandidate(msg.candidate).catch(() => {});
                  console.log("[presenter] added remote ICE candidate");
                }
                return;
              }
            };

            ws.addEventListener("message", onWsMessage);

            const cleanup = () => {
              ws.removeEventListener("message", onWsMessage);

              pc.close();

              displayStream
                .getTracks()
                .forEach((t: MediaStreamTrack) => t.stop());

              stopFocusKeepAlive();
            };
            window.addEventListener("beforeunload", cleanup, { once: true });
          } catch (err) {
            console.warn("Screen-share to paired phone failed", err);
            alert("Failed to start screen-share");
          }
        }}
        style={{
          position: "fixed",
          right: 12,
          top: 12,
          zIndex: 40,
          backgroundColor: "black",
          appearance: "none",
          border: "none",
          padding: 8,
          borderRadius: 4,
          color: "white",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
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

            const svgProps: React.SVGProps<SVGSVGElement> = {
              width: 200,
              height: 200,
              style: { display: "block", opacity: op },
            };

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
