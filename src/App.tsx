import React, { useState } from "react";
import { AppShell } from "./components/AppShell";
import Composer from "./components/Composer";
import { Sidebar } from "./components/Sidebar";
import { ScriptArea, type ScriptAreaHandle } from "./components/ScriptArea";
import { AddScriptModal } from "./components/modals/AddScriptModal";
import { ContextMenu } from "./components/overlays/ContextMenu";
import { splitIntoChaptersSmart } from "./lib/split-into-chapters";
import { useScripts } from "./hooks/useScripts";

import { AppearanceSettings } from "./types";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useInitialPermissionsGate } from "./hooks/useInitialPermissionsGate";
import { usePresenterBridge } from "./hooks/usePresenterBridge";
import { warn } from "./lib/logger";
import { useUiStore, DEFAULT_APPEARANCE, type UiStore } from "./stores/ui";
import PairedDeviceList from "./components/sidebar/PairedDeviceList";
import { useScreenDetection } from "./hooks/useScreenDetection";
import { useAppSpeechControl } from "./hooks/useAppSpeechControl"; // New Hook
import { useUndoStack } from "./hooks/useUndoStack";
import { hasPresenterWsSender } from "./lib/presenter-transport";

import {
  APPEARANCE_STORAGE_KEY,
  INITIAL_PERMISSIONS_KEY,
  FORCE_SHOW_PERMISSION_OVERLAY,
  SPEECH_LANGUAGE_KEY,
  VOICE_COMMANDS_KEY,
  SCREEN_STORAGE_KEY,
  EVT_PERMISSIONS_UPDATED,
} from "./lib/keys";

export default function App() {
  const {
    docs,
    activeDoc,
    activeDocId,
    setActiveDocId,
    addScript,
    removeScript,
    updateChapter,
    addChapter,
    addChapterBefore,
    removeChapter,
    moveChapter,
  } = useScripts({ persist: true });

  const [contentType, setContentType] = useState<"display" | "text" | "chat">(
    "text",
  );
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Ensure there is always a sensible active script:
  // - if there are no docs, clear activeDocId
  // - if activeDocId is missing or no longer exists (deleted), select the first doc
  React.useEffect(() => {
    if (!docs || docs.length === 0) {
      if (activeDocId) setActiveDocId("");
      return;
    }

    const exists = docs.find((d) => d.id === activeDocId);
    if (!activeDocId || !exists) {
      setActiveDocId(docs[0].id);
    }
  }, [docs, activeDocId, setActiveDocId]);

  const [appearance, setAppearance] = useLocalStorageState<AppearanceSettings>(
    APPEARANCE_STORAGE_KEY,
    DEFAULT_APPEARANCE,
  );

  // Apply a partial patch that must already be in the grouped shape.
  const updateAppearance = (patch: Partial<AppearanceSettings>) => {
    setAppearance((prev) => ({ ...prev, ...patch }) as AppearanceSettings);
  };

  // Normalize appearance: accept only the grouped shape and fill defaults.
  const normalizeAppearance = (a: Partial<AppearanceSettings> | undefined) => {
    const editor = {
      ...DEFAULT_APPEARANCE.editor!,
      ...(a?.editor ?? {}),
    } as NonNullable<AppearanceSettings["editor"]>;
    const presenter = {
      ...DEFAULT_APPEARANCE.presenter!,
      ...(a?.presenter ?? {}),
    } as NonNullable<AppearanceSettings["presenter"]>;

    return { editor, presenter } as AppearanceSettings;
  };

  // convenience destructures
  const {
    editor = DEFAULT_APPEARANCE.editor!,
    presenter = DEFAULT_APPEARANCE.presenter!,
  } = appearance;

  const [ctx, setCtx] = useState<{
    open: boolean;
    x: number;
    y: number;
    items: { label: string; hint?: string; disabled?: boolean }[];
    targetChapterId?: string | null;
    targetChapterText?: string | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    items: [],
    targetChapterId: null,
    targetChapterText: null,
  });

  // sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // remember previous sidebar state so we can restore after fullscreen
  const [prevSidebarCollapsed, setPrevSidebarCollapsed] = useState<
    boolean | null
  >(null);
  // track fullscreen state so children can adapt (remove maxWidth, etc.)
  const [isFullscreen, setIsFullscreen] = useState(false);

  // permission overlay + priming logic extracted into a hook
  const ls = useLocalStorage();
  const { showOverlay, onOverlayClick } = useInitialPermissionsGate();

  // screen detection (used by pairing logic)
  const screens = useScreenDetection();

  // Presenter bridge: message handling, lifecycle polling and small helpers are
  // extracted to a hook. We expose the same refs/state shape used elsewhere
  // for an incremental migration.
  const {
    presenterWindowRef,
    presenterState,
    openPresenter,
    send,
    play,
    pause,
    togglePlay,
    gotoChapter,
    setWordIndex,
    updateParams,
    on,
    displayedRefs,
  } = usePresenterBridge();
  const {
    playing: presenterIsPlaying,
    mic: presenterMicActive,
    windowOpen: presenterWindowOpen,
    wordIndex: presenterWordIndex,
  } = presenterState;
  const { presenterDisplayedDocRef, presenterDisplayedChapterRef } =
    displayedRefs;

  const isPresenterActive = Boolean(
    (presenterWindowRef.current && !presenterWindowRef.current.closed) ||
    hasPresenterWsSender(),
  );

  // App-side Speech State (Controlled by UI)
  const [micActive, setMicActive] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useLocalStorageState<string>(
    SPEECH_LANGUAGE_KEY,
    "es-ES",
  ); // persisted

  // Voice command configuration (persisted)
  const [voiceCommands, setVoiceCommands] = useLocalStorageState(
    VOICE_COMMANDS_KEY,
    {
      wakeWord: "Siri",
      requireWakeWord: true,
      retry: "mierda",
      restart: "restart",
    },
  );

  // Ensure presenter is opened/playing when microphone recording starts.
  async function handleToggleMic() {
    const starting = !micActive;

    if (starting) {
      // If presenter not open, open it and request it to play when ready.
      const existing = presenterWindowRef.current;
      if (!existing || existing.closed) {
        const opened = await onOpenTeleprompterFromEditor();
        if (opened) {
          // Wait for presenter-ready then request play (best-effort)
          let settled = false;

          if (on) {
            const unsub = on("presenter-ready", () => {
              settled = true;
              play();
              unsub();
            });
          } else {
            const onMsg = (e: MessageEvent) => {
              if (e.origin !== window.location.origin) return;
              if (e.data?.type === "presenter-ready") {
                settled = true;
                play();
                window.removeEventListener("message", onMsg);
              }
            };
            window.addEventListener("message", onMsg);
          }

          setTimeout(() => {
            if (!settled) play();
          }, 700);
        }
      } else {
        play();
      }
    } else {
      // stopping microphone — pause presenter (best-effort)
      pause();
    }

    // Toggle local mic state (this drives the recognition hook)
    setMicActive((v) => !v);
  }

  // Track words for speech sync
  const [syncedWordIndex, setSyncedWordIndex] = useState(0);

  // Hook up speech control in App
  const speechControl = useAppSpeechControl(
    micActive,
    activeDoc,
    presenter.preserveFormatting ?? false, // appearance setting
    speechLanguage,
    syncedWordIndex,
    (newIndex) => {
      setSyncedWordIndex(newIndex);
      // Send to presenter via centralized API
      setWordIndex(newIndex);
    },
    // restart (document start)
    () => {
      setSyncedWordIndex(0);
      send({ type: "prompter-reset" });
    },
    // voice-command callbacks — only enable command detection when the *appearance* toggle
    // for Voice Commands is enabled (users expect the toggle to turn commands on/off).
    {
      config: presenter.voiceCommands ? voiceCommands : undefined,
      onRetryChapter: (chapterStartWordIndex: number) => {
        setSyncedWordIndex(chapterStartWordIndex);
        setWordIndex(chapterStartWordIndex);
      },
      onRestartDocument: () => {
        // alias of the existing restart behavior
        setSyncedWordIndex(0);
        send({ type: "prompter-reset" });
      },
    },
  );

  // Broadcast voice-command config to presenter when it changes (so presenter UI can mirror settings)
  // Send `null` when the appearance toggle disables commands so presenter knows commands are OFF.
  React.useEffect(() => {
    send({
      type: "presenter-voice-commands",
      config: presenter.voiceCommands ? voiceCommands : null,
    });
  }, [voiceCommands, presenterState.windowOpen, presenter.voiceCommands]);
  // selectively subscribe instead of receiving many props.
  const patchUiAppearance = useUiStore((s: UiStore) => s.patchAppearance);
  const setUiContentType = useUiStore((s: UiStore) => s.setContentType);

  React.useEffect(() => {
    patchUiAppearance(appearance);
  }, [appearance, patchUiAppearance]);

  React.useEffect(() => {
    setUiContentType(contentType);
  }, [contentType, setUiContentType]);

  // Sync presenter-initiated wordIndex (user clicked in presenter) -> App state
  React.useEffect(() => {
    if (
      typeof presenterWordIndex === "number" &&
      presenterWordIndex !== syncedWordIndex
    ) {
      setSyncedWordIndex(presenterWordIndex);
    }
  }, [presenterWordIndex]);

  const scriptAreaRef = React.useRef<ScriptAreaHandle | null>(null);
  // --- Undo / Redo stacks for chapter text edits -------------------------------------
  type EditEntry = {
    kind: "edit";
    docId: string;
    chapterId: string;
    before: string;
    time: number;
  };
  type SplitEntry = {
    kind: "split";
    docId: string;
    chapterId: string;
    before: string;
    insertedIds: string[];
    parts: string[];
    time: number;
  };
  type RemoveEntry = {
    kind: "remove";
    docId: string;
    chapterId: string;
    index: number; // original index in chapters array
    text: string;
    time: number;
  };
  type UndoEntry = EditEntry | SplitEntry | RemoveEntry;

  const lastRecordRef = React.useRef<{
    docId?: string;
    chapterId?: string;
    time?: number;
  } | null>(null);
  const UNDO_COALESCE_MS = 1500; // coalesce rapid keystrokes into a single undo entry
  const MAX_UNDO = 200;

  // centralized undo/redo stack (extracted to hook)
  const {
    pushUndo,
    pushRedo,
    popUndo,
    popRedo,
    clearRedo,
    removeUndoEntriesForDoc,
    removeRedoEntriesForDoc,
    getUndoStack,
    getRedoStack,
  } = useUndoStack<UndoEntry>({ maxUndo: MAX_UNDO });

  /**
   * Apply a chapter text change while optionally recording an undo snapshot.
   * Coalesces repeated rapid edits to avoid pushing an entry per keystroke.
   */
  function applyChapterChange(
    docId: string,
    chapterId: string,
    newText: string,
    recordUndo = true,
  ) {
    try {
      const doc = docs.find((d) => d.id === docId);
      const chapter = doc?.chapters.find((c) => c.id === chapterId);
      const prev = chapter?.text ?? "";
      if (prev === newText) return;

      if (recordUndo) {
        const last = lastRecordRef.current;
        const now = Date.now();
        if (
          !last ||
          last.chapterId !== chapterId ||
          last.docId !== docId ||
          now - (last.time ?? 0) > UNDO_COALESCE_MS
        ) {
          pushUndo({
            kind: "edit",
            docId,
            chapterId,
            before: prev,
            time: now,
          });
          // new user edit invalidates redo
          clearRedo();
          lastRecordRef.current = { docId, chapterId, time: now };
        }
      } else {
        // non-user edits should also clear redo (to avoid surprising redo paths)
        clearRedo();
      }

      // perform the actual update (don't record again)
      updateChapter(docId, chapterId, newText);
    } catch (err) {
      updateChapter(docId, chapterId, newText);
    }
  }

  // Keyboard handler: Ctrl/Cmd+Z -> undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y -> redo
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      // Only handle undo/redo when focus is inside a chapter textarea
      const active = document.activeElement as HTMLElement | null;
      const isChapterTextarea = Boolean(
        active &&
        (active.matches?.("textarea[data-chapter-textarea]") ||
          active.closest?.(
            "[data-chapter-id] textarea[data-chapter-textarea]",
          )),
      );
      if (!isChapterTextarea) return;

      // UNDO
      if (key === "z" && !e.shiftKey) {
        const entry = popUndo();
        if (!entry) return;
        e.preventDefault();
        e.stopPropagation();

        if (entry.kind === "edit") {
          // capture current text for redo
          const current =
            docs
              .find((d) => d.id === entry.docId)
              ?.chapters.find((c) => c.id === entry.chapterId)?.text ?? "";
          pushRedo({
            kind: "edit",
            docId: entry.docId,
            chapterId: entry.chapterId,
            before: current,
            time: Date.now(),
          });

          // apply previous text without recording
          updateChapter(entry.docId, entry.chapterId, entry.before);
          const ta = document.querySelector<HTMLTextAreaElement>(
            `[data-chapter-textarea="${entry.chapterId}"]`,
          );
          if (ta) {
            ta.focus();

            ta.setSelectionRange(
              Math.min(entry.before.length, ta.value.length),
              Math.min(entry.before.length, ta.value.length),
            );
          }
        } else if (entry.kind === "remove") {
          // undo a chapter deletion: re-insert at original index and restore text
          const doc = docs.find((d) => d.id === entry.docId);
          if (doc) {
            const insertBefore = doc.chapters[entry.index];
            let newId: string | undefined;
            if (insertBefore) {
              newId = addChapterBefore(entry.docId, insertBefore.id);
              if (newId) updateChapter(entry.docId, newId, entry.text);
            } else {
              newId = addChapter(entry.docId, { text: entry.text });
            }

            if (newId) {
              pushRedo({
                kind: "remove",
                docId: entry.docId,
                chapterId: String(newId),
                index: entry.index,
                text: entry.text,
                time: Date.now(),
              });

              scriptAreaRef.current?.focusChapter(String(newId));
            }
          }
        } else if (entry.kind === "split") {
          // for split undo: remove inserted chapters and restore the original text
          // capture the current split parts so redo can reapply them
          const doc = docs.find((d) => d.id === entry.docId);
          const first =
            doc?.chapters.find((c) => c.id === entry.chapterId)?.text ?? "";
          const insertedTexts = entry.insertedIds.map(
            (id) => doc?.chapters.find((c) => c.id === id)?.text ?? "",
          );
          const partsForRedo = [first, ...insertedTexts];
          pushRedo({
            kind: "split",
            docId: entry.docId,
            chapterId: entry.chapterId,
            before: entry.before,
            insertedIds: entry.insertedIds,
            parts: partsForRedo,
            time: Date.now(),
          });

          // remove inserted chapters
          for (const id of entry.insertedIds.slice().reverse()) {
            removeChapter(entry.docId, id);
          }
          // restore original text
          updateChapter(entry.docId, entry.chapterId, entry.before);
          const ta = document.querySelector<HTMLTextAreaElement>(
            `[data-chapter-textarea="${entry.chapterId}"]`,
          );
          if (ta) {
            ta.focus();

            ta.setSelectionRange(
              Math.min(entry.before.length, ta.value.length),
              Math.min(entry.before.length, ta.value.length),
            );
          }
        }

        return;
      }

      // REDO (Shift+Z or Y)
      if ((key === "z" && e.shiftKey) || key === "y") {
        const entry = popRedo();
        if (!entry) return;
        e.preventDefault();
        e.stopPropagation();

        if (entry.kind === "edit") {
          // capture current for undo
          const current =
            docs
              .find((d) => d.id === entry.docId)
              ?.chapters.find((c) => c.id === entry.chapterId)?.text ?? "";
          pushUndo({
            kind: "edit",
            docId: entry.docId,
            chapterId: entry.chapterId,
            before: current,
            time: Date.now(),
          });

          updateChapter(entry.docId, entry.chapterId, entry.before);
          const ta = document.querySelector<HTMLTextAreaElement>(
            `[data-chapter-textarea="${entry.chapterId}"]`,
          );
          if (ta) {
            ta.focus();

            ta.setSelectionRange(
              Math.min(entry.before.length, ta.value.length),
              Math.min(entry.before.length, ta.value.length),
            );
          }
        } else if (entry.kind === "remove") {
          // redo a deletion: remove the chapter and push undo snapshot to restore it
          const doc = docs.find((d) => d.id === entry.docId);
          if (doc) {
            const prevText =
              doc.chapters.find((c) => c.id === entry.chapterId)?.text ?? "";
            const prevIndex = doc.chapters.findIndex(
              (c) => c.id === entry.chapterId,
            );
            pushUndo({
              kind: "remove",
              docId: entry.docId,
              chapterId: entry.chapterId,
              index: prevIndex,
              text: prevText,
              time: Date.now(),
            });
            removeChapter(entry.docId, entry.chapterId);
          }
        } else if (entry.kind === "split") {
          // redo the split by re-applying the saved `parts` array (recreate inserted chapters)
          const parts = Array.isArray(entry.parts) ? entry.parts : null;
          if (!parts || parts.length <= 1) return;

          // capture state for undo (previous full-text of the chapter)
          const prev =
            docs
              .find((d) => d.id === entry.docId)
              ?.chapters.find((c) => c.id === entry.chapterId)?.text ?? "";
          pushUndo({
            kind: "split",
            docId: entry.docId,
            chapterId: entry.chapterId,
            before: prev,
            insertedIds: [],
            parts: [],
            time: Date.now(),
          });

          // apply first part and append others
          updateChapter(entry.docId, entry.chapterId, parts[0]);
          const prevId = entry.chapterId;
          for (let i = 1; i < parts.length; i++) {
            addChapter(entry.docId, { afterId: prevId, text: parts[i] });
            // we intentionally don't attempt to re-create original IDs — redo will create fresh chapters
          }

          const ta = document.querySelector<HTMLTextAreaElement>(
            `[data-chapter-textarea="${entry.chapterId}"]`,
          );
          if (ta) {
            ta.focus();

            ta.setSelectionRange(
              Math.min(parts[0].length, ta.value.length),
              Math.min(parts[0].length, ta.value.length),
            );
          }
        }

        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docs, updateChapter, removeChapter, addChapter]);
  // Simple permission overlay (shows on pageload until first user click).
  // On click: request permissions (gesture-primed) then forward the click to
  // the underlying element so user's original intent (Play/Present) proceeds.
  const [showPermissionOverlay, setShowPermissionOverlay] =
    React.useState<boolean>(false);

  function hidePermissionOverlay() {
    ls.setRaw(INITIAL_PERMISSIONS_KEY, "1");

    setShowPermissionOverlay(false);
  }

  // Determine whether to show the overlay on mount: show when we haven't
  // already requested permissions and microphone permission isn't granted.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // dev override for testing

        if (ls.getRaw(FORCE_SHOW_PERMISSION_OVERLAY) === "1") {
          if (!mounted) return;
          setShowPermissionOverlay(true);
          return;
        }

        const alreadyAsked = Boolean(ls.getRaw(INITIAL_PERMISSIONS_KEY));
        let micGranted = false;
        try {
          const p = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
          micGranted = (p as PermissionStatus | undefined)?.state === "granted";
        } catch (_) {
          // if Permissions API isn't available, don't assume granted
          micGranted = false;
        }

        if (!mounted) return;
        // show overlay if we haven't asked yet OR mic is not granted
        setShowPermissionOverlay(!alreadyAsked || !micGranted);
      } catch (_) {
        if (!mounted) return;
        setShowPermissionOverlay(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ls]);

  // Handler used by the overlay — runs inside the user's click event so
  // browsers will treat permission API calls as gesture-primed.
  function handlePermissionOverlayClick(e: React.MouseEvent) {
    // prevent double-processing
    e.stopPropagation();
    e.preventDefault();

    // coordinates of the original click
    const x = e.clientX ?? window.innerWidth / 2;
    const y = e.clientY ?? window.innerHeight / 2;

    // Start permission requests synchronously (gesture-primed). Don't await.

    (
      navigator.mediaDevices.getUserMedia({
        audio: true,
      }) as Promise<MediaStream>
    ).catch(() => {});

    (window as unknown as { getScreenDetails?: () => Promise<unknown> }).getScreenDetails?.().catch(() => {});

    // Temporarily allow pointer-events through so we can forward the click to
    // the underlying element the user actually intended to click.
    const overlay = e.currentTarget as HTMLElement | null;
    if (overlay) {
      overlay.style.pointerEvents = "none";
      const underlying = document.elementFromPoint(x, y) as HTMLElement | null;
      if (underlying) {
        try {
          // Dispatch a real click on the underlying element so handlers run
          // as if the overlay wasn't present.
          underlying.click();
        } catch (_) {
          underlying.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              clientX: x,
              clientY: y,
            }),
          );
        }
      }
      // restore pointer-events (we'll hide the overlay shortly)
      overlay.style.pointerEvents = "";
    }

    // hide overlay after a short delay so the forwarded click can run
    setTimeout(() => {
      hidePermissionOverlay();

      window.dispatchEvent(new Event(EVT_PERMISSIONS_UPDATED));
    }, 250);
  }

  async function onOpenTeleprompterFromEditor() {
    // permissions are requested on the first user gesture (global overlay).
    // No-op here — the overlay/capture handler primes permissions.

    // Prefer any screen selected in the Sidebar (persisted to localStorage),
    // otherwise fall back to the primary screen.
    const persisted = (() => {
      try {
        return ls.getRaw(SCREEN_STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    type LocalScreen = { id: string; left: number; top: number; width: number; height: number; isPrimary?: boolean; label: string };

    let chosenScreen: LocalScreen = {
      id: "0",
      left: 0,
      top: 0,
      width: window.screen.width,
      height: window.screen.height,
      isPrimary: true,
      label: `Primary — ${window.screen.width}×${window.screen.height}`,
    };

    const details = await (window as unknown as { getScreenDetails?: () => Promise<{ screens?: unknown[]; currentScreen?: unknown }> }).getScreenDetails?.();
    type RawScreen = { id?: unknown; left?: unknown; top?: unknown; width?: unknown; height?: unknown; isPrimary?: unknown; label?: unknown };
    const screensList: RawScreen[] = (details as unknown as { screens?: RawScreen[] })?.screens ?? [];
    if (persisted && screensList.length) {
      const match = screensList.find((s: RawScreen) => (String(s.label ?? "") === persisted) || String(s.id) === persisted);
      if (match)
        chosenScreen = {
          id: String(match.id ?? 0),
          left: Number(match.left ?? 0),
          top: Number(match.top ?? 0),
          width: Number(match.width ?? window.screen.width),
          height: Number(match.height ?? window.screen.height),
          isPrimary: Boolean(match.isPrimary),
          label: String(match.label ?? `Display — ${match.width}×${match.height}`),
        };
    } else if (screensList.length) {
      const s = screensList[0];
      chosenScreen = {
        id: String(s.id ?? 0),
        left: Number(s.left ?? 0),
        top: Number(s.top ?? 0),
        width: Number(s.width ?? window.screen.width),
        height: Number(s.height ?? window.screen.height),
        isPrimary: Boolean(s.isPrimary),
        label: String(s.label ?? `Display — ${s.width}×${s.height}`),
      };
    }

    try {
      const win = openPresenter({
        screen: chosenScreen,
        docs,
        activeDocId,
        appearance: { editor, presenter },
      });

      setTimeout(() => {
        send({
          type: "hold-for-enter",
          rotate: Boolean(presenter?.rotateScreen),
        });
      }, 700);
      return win;
    } catch (err) {
      /* ignore */
      return null;
    }
  }

  async function onPlayFromEditor() {
    const existing = presenterWindowRef.current;
    if (existing && !existing.closed) {
      if (presenterIsPlaying) pause();
      else play();
      return;
    }

    // fallback: open the presenter if not attached — auto-start when ready
    const openedWin = await onOpenTeleprompterFromEditor();
    if (!openedWin) return;

    let settled = false;

    if (on) {
      const unsub = on("presenter-ready", () => {
        settled = true;
        play();
        unsub();
      });
    } else {
      function onMsgOnce(e: MessageEvent) {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === "presenter-ready") {
          settled = true;
          play();
          window.removeEventListener("message", onMsgOnce);
        }
      }
      window.addEventListener("message", onMsgOnce);
    }

    // fallback: try to kick-play after a short delay in case presenter doesn't reply
    setTimeout(() => {
      if (settled) return;
      play();
    }, 700);
  }

  function handleFullscreenChange(isFs: boolean) {
    setIsFullscreen(isFs);

    if (isFs) {
      setPrevSidebarCollapsed(sidebarCollapsed);
      setSidebarCollapsed(true);

      // measure on next animation frames so layout/fullscreen styles settle
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const measured = scriptAreaRef.current?.measureContentWidth?.();
          if (measured) {
            const [contentPx, containerPx] = measured;
            if (containerPx > 0) {
              const newPct = Math.min(
                100,
                Math.max(30, Math.round((contentPx / containerPx) * 100)),
              );
              updateAppearance({ editor: { ...editor, width: newPct } });
            }
          }
        }),
      );
    } else {
      if (prevSidebarCollapsed !== null) {
        setSidebarCollapsed(prevSidebarCollapsed);
        setPrevSidebarCollapsed(null);
      }
    }
  }

  function openAddScript() {
    setAddModalOpen(true);
  }

  function removeActiveScript() {
    if (!activeDocId) return;
    removeScript(activeDocId);
  }

  function onEditorContextMenu(e: React.MouseEvent) {
    e.preventDefault();

    const target = e.target as HTMLElement | null;
    const chapterEl = target?.closest?.(
      "[data-chapter-id]",
    ) as HTMLElement | null;
    const ta =
      ((target as HTMLElement)?.closest?.(
        "textarea[data-chapter-textarea]",
      ) as HTMLTextAreaElement | null) ||
      (chapterEl?.querySelector(
        "textarea[data-chapter-textarea]",
      ) as HTMLTextAreaElement | null);

    const chapterId = chapterEl?.dataset?.chapterId ?? undefined;
    const chapterText =
      ta?.value ??
      (chapterId
        ? (activeDoc?.chapters.find((c) => c.id === chapterId)?.text ?? "")
        : "");

    const canSplit = Boolean(
      chapterText && chapterText.trim().split(/\s+/).filter(Boolean).length > 1,
    );

    setCtx({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Cut", hint: "Ctrl+X", disabled: true },
        { label: "Copy", hint: "Ctrl+C" },
        { label: "Paste", hint: "Ctrl+V", disabled: true },
        { label: "—" },
        { label: "Split into Chapters", disabled: !canSplit },
        { label: "Split chapter", hint: "Shift+Enter", disabled: true },
        { label: "Delete chapter", hint: "Shift+Del", disabled: true },
        { label: "Add chapter before" },
        { label: "Add chapter after" },
      ],
      targetChapterId: chapterId ?? null,
      targetChapterText: chapterText ?? null,
    });
  }

  // Perform an atomic split (used by keyboard split and other callers). Returns the new chapter id when created.
  function handleSplitChapter(
    chapterId: string,
    beforeText: string,
    remainderText: string,
  ) {
    if (!activeDocId) return;
    try {
      const doc = docs.find((d) => d.id === activeDocId);
      if (!doc) return;
      const chapter = doc.chapters.find((c) => c.id === chapterId);
      if (!chapter) return;

      const prevText = chapter.text;

      // apply the split: update existing chapter and insert new one
      updateChapter(activeDocId, chapterId, beforeText);
      const newId = addChapter(activeDocId, {
        afterId: chapterId,
        text: remainderText,
      });
      const insertedIds = newId ? [String(newId)] : [];

      // push single undo entry
      pushUndo({
        kind: "split",
        docId: activeDocId,
        chapterId,
        before: prevText,
        insertedIds,
        parts: [beforeText, remainderText],
        time: Date.now(),
      });
      clearRedo();

      // keep user focus on the source (split) chapter
      scriptAreaRef.current?.focusChapter(chapterId);
      return newId;
    } catch (err) {
      return undefined;
    }
  }

  return (
    <>
      {/* Mount pairing logic at App level (non-visual) */}
      <PairedDeviceList
        presenterWindowRef={presenterWindowRef}
        onOpenTeleprompter={onOpenTeleprompterFromEditor}
        screens={screens}
        on={on}
        scripts={docs}
        activeScriptId={activeDocId}
        appearance={presenter}
      />

      <AppShell
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        left={
          <Sidebar
            scripts={docs}
            activeScriptId={activeDocId}
            onSelectScript={setActiveDocId}
            onAddScript={openAddScript}
            onRemoveScript={removeActiveScript}
            appearance={appearance}
            updateAppearance={updateAppearance}
            presenterWindowRef={presenterWindowRef}
            presenterDisplayedDocRef={presenterDisplayedDocRef}
            presenterDisplayedChapterRef={presenterDisplayedChapterRef}
            presenterState={presenterState}
            speechLanguage={speechLanguage}
            onSpeechLanguageChange={setSpeechLanguage}
            voiceCommands={voiceCommands}
            setVoiceCommands={setVoiceCommands}
            onOpenTeleprompter={onOpenTeleprompterFromEditor}
            send={send}
            on={on}
            // on-device speech helpers (check / install)
            checkSpeechOnDevice={speechControl?.checkOnDevice}
            installSpeechOnDevice={speechControl?.installOnDevice}
            isSpeechOnDeviceAvailable={speechControl?.isOnDeviceAvailable}
          />
        }
        main={
          <ScriptArea
            ref={scriptAreaRef}
            doc={activeDoc}
            isFullscreen={isFullscreen}
            contentWidthPct={editor.width!}
            contentFontSize={editor.fontSize!}
            contentFontFamily="Inter"
            contentFontWeight={400}
            onChangeContentWidthPct={(v) =>
              updateAppearance({ editor: { ...editor, width: v } })
            }
            onChangeContentFontSize={(v) =>
              updateAppearance({ editor: { ...editor, fontSize: v } })
            }
            onContextMenu={onEditorContextMenu}
            onChangeChapter={(chapterId, text) => {
              // record undo and apply change (coalesced)
              applyChapterChange(activeDocId, chapterId, text, true);

              // Send updated chapter text to presenter if it's displaying this doc/chapter
              if (isPresenterActive) {
                if (presenterDisplayedDocRef.current === activeDocId) {
                  send({ type: "update-chapter", chapterId, text });
                }
              }
            }}
            onSplitChapter={(chapterId, beforeText, remainderText) =>
              handleSplitChapter(chapterId, beforeText, remainderText)
            }
            onGotoChapter={(chapterId: string) => {
              // If presenter is open (locally or via WS), send the jump immediately.
              if (isPresenterActive) {
                // Ensure presenter is displaying the same doc first — if not, send the doc
                if (
                  presenterDisplayedDocRef.current !== activeDocId &&
                  activeDoc
                ) {
                  send({ type: "presenter-load-doc", doc: activeDoc });
                  // small delay to let the presenter process the load-doc message
                  setTimeout(() => {
                    gotoChapter(chapterId);
                  }, 120);
                } else {
                  gotoChapter(chapterId);
                }

                return;
              }

              // Otherwise, open the presenter and retry until the window appears (safe, short-lived retries).
              onOpenTeleprompterFromEditor();

              const start = Date.now();
              const timeout = 2500; // ms
              const interval = 150; // ms

              (function poll() {
                const win = presenterWindowRef.current;
                if (win && !win.closed) {
                  gotoChapter(chapterId);
                  return;
                }
                if (Date.now() - start > timeout) {
                  // give up; optional: surface a small notice
                  warn("Presenter did not open in time to jump to chapter");
                  return;
                }
                setTimeout(poll, interval);
              })();
            }}
            onAddChapter={(afterId?: string, text?: string) => {
              const id = addChapter(activeDocId, { afterId, text });
              // structural change — clear undone snapshots for this doc
              removeUndoEntriesForDoc(activeDocId);
              removeRedoEntriesForDoc(activeDocId);
              return id;
            }}
            onAddChapterBefore={(beforeId) => {
              const id = addChapterBefore(activeDocId, beforeId);
              // structural change — clear undone snapshots for this doc
              removeUndoEntriesForDoc(activeDocId);
              removeRedoEntriesForDoc(activeDocId);
              return id;
            }}
            onRemoveChapter={(chapterId) => {
              // make delete undoable: capture chapter text + index, push RemoveEntry, then remove
              try {
                const doc = docs.find((d) => d.id === activeDocId);
                const idx =
                  doc?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
                const txt =
                  doc?.chapters.find((c) => c.id === chapterId)?.text ?? "";

                // pick a sensible target to focus after removal (next chapter, else previous)
                const focusId =
                  idx !== -1
                    ? (doc?.chapters[idx + 1]?.id ??
                      doc?.chapters[idx - 1]?.id ??
                      null)
                    : null;

                if (idx !== -1) {
                  pushUndo({
                    kind: "remove",
                    docId: activeDocId,
                    chapterId,
                    index: idx,
                    text: txt,
                    time: Date.now(),
                  });
                }

                // perform removal
                removeChapter(activeDocId, chapterId);

                // structural change invalidates redo for this doc
                removeRedoEntriesForDoc(activeDocId);

                // keep focus inside the editor so global Undo (Cmd/Ctrl+Z) will work immediately
                if (focusId) {
                  scriptAreaRef.current?.focusChapter(String(focusId));
                } else {
                  // if no chapter remains, focus the first textarea if present (best-effort)
                  setTimeout(() => {
                    const ta = document.querySelector<HTMLTextAreaElement>(
                      "textarea[data-chapter-textarea]",
                    );
                    ta?.focus();
                  }, 0);
                }
              } catch (_) {
                // best-effort fallback: remove and clear redo
                removeChapter(activeDocId, chapterId);
                removeRedoEntriesForDoc(activeDocId);
              }
            }}
            onMoveChapter={(chapterId: string, toIndex: number) => {
              moveChapter(activeDocId, chapterId, toIndex);
              removeUndoEntriesForDoc(activeDocId);
              removeRedoEntriesForDoc(activeDocId);
            }}
            presenterWindowOpen={isPresenterActive}
            onPlay={onPlayFromEditor}
            micActive={micActive}
            playing={presenterIsPlaying}
            onToggleMic={handleToggleMic}
            onRestart={() => {
              setSyncedWordIndex(0);
              setWordIndex(0);
            }}
          />
        }
        composer={<Composer />}
        onFullscreenChange={handleFullscreenChange}
        overlay={
          <>
            <AddScriptModal
              open={addModalOpen}
              onClose={() => setAddModalOpen(false)}
              onAdd={(name) => {
                addScript(name);
                setAddModalOpen(false);
              }}
            />
            <ContextMenu
              open={ctx.open}
              x={ctx.x}
              y={ctx.y}
              items={ctx.items}
              onClose={() => setCtx((p) => ({ ...p, open: false }))}
              onSelect={async (label) => {
                try {
                  if (label !== "Split into Chapters")
                    return setCtx((p) => ({ ...p, open: false }));
                  const chapterId = ctx.targetChapterId;
                  const text = (ctx.targetChapterText ?? "").toString();
                  if (!chapterId || !text.trim())
                    return setCtx((p) => ({ ...p, open: false }));

                  const parts = splitIntoChaptersSmart(text);
                  if (!parts || parts.length <= 1)
                    return setCtx((p) => ({ ...p, open: false }));

                  // perform split as a single transactional action so it can be undone cleanly
                  const prevText = text;
                  // apply first part directly
                  updateChapter(activeDocId, chapterId, parts[0]);

                  // insert the rest sequentially after the previous inserted id and collect their ids
                  let prevId: string | undefined = chapterId;
                  const insertedIds: string[] = [];
                  for (let i = 1; i < parts.length; i++) {
                    const newId = addChapter(activeDocId, {
                      afterId: prevId,
                      text: parts[i],
                    });
                    if (newId) {
                      insertedIds.push(String(newId));
                      prevId = String(newId);
                    }
                  }

                  // push a single undo entry that will restore the original chapter text and remove inserted chapters
                  pushUndo({
                    kind: "split",
                    docId: activeDocId,
                    chapterId,
                    before: prevText,
                    insertedIds,
                    parts,
                    time: Date.now(),
                  });
                  // new user action invalidates redo
                  clearRedo();

                  // focus the source (split) chapter in the editor so user stays in context
                  scriptAreaRef.current?.focusChapter(chapterId);
                } catch (err) {
                } finally {
                  setCtx((p) => ({ ...p, open: false }));
                }
              }}
            />
          </>
        }
      />

      {/* Permission overlay shown on first load until user interacts */}
      {showPermissionOverlay && (
        <div
          className="fixed inset-0 z-50 bg-black/50 grid place-items-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={handlePermissionOverlayClick}
        >
          <div
            className="bg-[color:var(--bg-2)] px-6 py-5 rounded-xl max-w-sm text-center"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-white mb-2">
              Enable microphone & screen
            </div>
            <div className="text-sm text-white/70 mb-4">
              Tap anywhere to allow microphone & screen access so the presenter
              works. Your first click will both request permissions and activate
              the control you clicked.
            </div>
            <div className="flex justify-center">
              <button
                className="px-4 py-2 bg-[color:var(--accent)] text-black rounded-md"
                onClick={handlePermissionOverlayClick}
              >
                Allow & continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
