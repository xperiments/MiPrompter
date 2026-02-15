import React, { useMemo, useState } from "react";
import type { ScriptDoc } from "../types";
import { BottomBar } from "./editor/BottomBar";
import { ChapterBlock } from "./editor/ChapterBlock";
import { TopBar } from "./editor/TopBar";
import Icon from "./ui/Icon";

// await nextFrame() gives a clear, testable point after the next paint.
const nextFrame = () =>
  new Promise<void>((res) => requestAnimationFrame(() => res()));

export type ScriptAreaHandle = {
  /** returns [contentPx, containerPx] or null if not available */
  measureContentWidth: () => [number, number] | null;
  /** focus a chapter (call with null to clear) */
  focusChapter: (chapterId: string | null) => void;
};

export type ScriptAreaProps = {
  doc: ScriptDoc | null;
  isFullscreen?: boolean;
  contentWidthPct?: number; // controls chapter textarea width (percentage)
  contentFontSize?: number; // font-size in px for chapter textareas
  contentFontFamily?: string;
  contentFontWeight?: 400 | 500 | 600;
  onChangeContentWidthPct?: (v: number) => void; // NEW: allow parent to update width from inside the editor
  onChangeContentFontSize?: (v: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onChangeChapter: (chapterId: string, text: string) => void;
  onAddChapter: (afterId?: string, text?: string) => string | void;
  onAddChapterBefore: (beforeId: string) => string | void;
  onRemoveChapter: (chapterId: string) => void;
  onMoveChapter?: (chapterId: string, toIndex: number) => void;
  /** Parent may provide an atomic split handler so the app can create a single undo entry. */
  onSplitChapter?: (
    chapterId: string,
    beforeText: string,
    remainderText: string,
  ) => string | void;
  /** Request presenter to show a chapter */
  onGotoChapter?: (chapterId: string) => void;
  onPlay?: () => void;
  presenterWindowOpen?: boolean;
  micActive?: boolean;
  playing?: boolean;
  onToggleMic?: () => void;
  onRestart?: () => void;
};

export const ScriptArea = React.forwardRef<
  ScriptAreaHandle | null,
  ScriptAreaProps
>(function ScriptArea(props, ref) {
  const chapters = useMemo(() => props.doc?.chapters ?? [], [props.doc]);
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);

  // When the editor column itself is using the maximum available space (e.g. sidebar collapsed)
  // allow the content area to grow beyond the legacy 900px cap. Detect container width and
  // remove the hard cap when there's enough room so the Width slider can expand the content.
  const [allowWideContent, setAllowWideContent] = React.useState(false);
  React.useEffect(() => {
    function check() {
      const w = containerRef.current?.getBoundingClientRect().width ?? 0;
      // if the editor column is wider than ~1000px allow content to grow past 900px
      setAllowWideContent(w > 1000);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  React.useEffect(() => {
    if (!focusedChapterId) return;
    let mounted = true;
    (async () => {
      await nextFrame();
      if (!mounted) return;
      const el = containerRef.current?.querySelector(
        `[data-chapter-id="${focusedChapterId}"]`,
      );
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      const ta = document.querySelector<HTMLTextAreaElement>(
        `[data-chapter-textarea="${focusedChapterId}"]`,
      );
      ta?.focus();
    })();
    return () => {
      mounted = false;
    };
  }, [focusedChapterId]);
  // expose a small imperative API so parent can measure widths (used when entering fullscreen)
  React.useImperativeHandle(
    ref,
    () => ({
      measureContentWidth() {
        const contentRect = innerRef.current?.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!contentRect || !containerRect) return null;
        return [contentRect.width, containerRect.width];
      },
      focusChapter(chapterId: string | null) {
        // update local focus state — ScriptArea already focuses & scrolls when focusedChapterId changes
        setFocusedChapterId(chapterId);
        // ensure DOM focus happens after state updates/layout
        if (chapterId) {
          (async () => {
            await nextFrame();
            await nextFrame();
            const ta = document.querySelector<HTMLTextAreaElement>(
              `[data-chapter-textarea="${chapterId}"]`,
            );
            if (!ta) return;
            ta.focus();
            const pos = Math.min(ta.value.length, (ta.value ?? "").length);
            ta.setSelectionRange(pos, pos);
            ta.scrollIntoView({ block: "center", behavior: "smooth" });
          })();
        }
      },
    }),
    [],
  ); // drag state & handlers for reordering
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function onDragStart(id: string, e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(id);
  }

  function onDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function onDragEnter(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    if (targetId === draggedId) return;
    setDragOverId(targetId);
  }

  function onDragOver(targetId: string, e: React.DragEvent) {
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    const srcId = e.dataTransfer.getData("text/plain") || draggedId;
    if (!srcId || !props.doc) return onDragEnd();

    const targetIndex = props.doc.chapters.findIndex((c) => c.id === targetId);
    if (targetIndex === -1) return onDragEnd();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;
    const toIndex = insertAfter ? targetIndex + 1 : targetIndex;

    props.onMoveChapter?.(srcId, toIndex);
    setFocusedChapterId(srcId);
    onDragEnd();
  }
  if (!props.doc) {
    return <div className="p-6 text-sm text-white/60">No script selected</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        contentFontSize={props.contentFontSize}
        onChangeContentFontSize={props.onChangeContentFontSize}
        contentWidthPct={props.contentWidthPct}
        onChangeContentWidthPct={props.onChangeContentWidthPct}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4">
          <div className="h-full ui-inset rounded-lg overflow-hidden relative">
            <div className="flex items-center justify-between gap-3 px-6 pt-4">
              <div>
                <div className="text-sm text-white/70">{props.doc.name}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="text-sm text-white/70 bg-white/3 hover:bg-white/5 rounded-md px-3 py-1 flex items-center"
                  onClick={() => {
                    const id = props.onAddChapter();
                    if (id) setFocusedChapterId(String(id));
                  }}
                >
                  <Icon name="plus" width={16} className="mr-2" aria-hidden />
                  <span>Add chapter</span>
                </button>
              </div>
            </div>

            <div
              ref={containerRef}
              className="h-[calc(100%-64px)] overflow-auto px-6 py-5"
              onContextMenu={props.onContextMenu}
            >
              <div
                ref={innerRef}
                className="mx-auto"
                style={{
                  width: props.contentWidthPct
                    ? `${props.contentWidthPct}%`
                    : undefined,
                  // keep the 900px cap for typical layouts, but remove it when the
                  // editor column itself is already very wide so the width % can grow
                  maxWidth: props.isFullscreen
                    ? undefined
                    : allowWideContent
                      ? undefined
                      : 900,
                }}
              >
                <div className="space-y-6">
                  {chapters.map((c) => (
                    <ChapterBlock
                      key={c.id}
                      id={c.id}
                      text={c.text}
                      autoFocus={focusedChapterId === c.id}
                      draggable={true}
                      aria-grabbed={draggedId === c.id}
                      className={
                        dragOverId === c.id
                          ? "ring-2 ring-[color:var(--accent)]"
                          : undefined
                      }
                      onDragStart={(e) => onDragStart(c.id, e)}
                      onDragEnter={(e) => onDragEnter(c.id, e)}
                      onDragOver={(e) => onDragOver(c.id, e)}
                      onDrop={(e) => onDrop(c.id, e)}
                      onDragEnd={onDragEnd}
                      onChange={(text) => props.onChangeChapter(c.id, text)}
                      fontSize={props.contentFontSize}
                      onAddAfter={(text) => {
                        const newId = props.onAddChapter(c.id, text);
                        if (newId) setFocusedChapterId(String(newId));
                      }}
                      onAddBefore={() => {
                        const newId = props.onAddChapterBefore(c.id);
                        if (newId) setFocusedChapterId(String(newId));
                      }}
                      onDelete={() => props.onRemoveChapter(c.id)}
                      onSplit={(before, remainder) => {
                        // ask the app to perform an atomic split so undo can treat it as one action
                        const newId = props.onSplitChapter
                          ? props.onSplitChapter(c.id, before, remainder)
                          : props.onAddChapter(c.id, remainder);
                        if (newId) setFocusedChapterId(String(newId));
                      }}
                      onGoto={() => props.onGotoChapter?.(c.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* subtle border like the app */}
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/5" />
          </div>
        </div>
      </div>

      <BottomBar
        fontSize={props.contentFontSize ?? 15}
        onPlay={props.onPlay}
        presenterWindowOpen={Boolean(props.presenterWindowOpen)}
        micActive={props.micActive}
        playing={props.playing}
        onToggleMic={props.onToggleMic}
        onRestart={props.onRestart}
      />
    </div>
  );
});
