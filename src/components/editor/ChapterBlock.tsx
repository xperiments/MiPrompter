import React from "react";
import Icon from "../ui/Icon";

export function ChapterBlock(props: {
  id: string;
  text: string;
  autoFocus?: boolean;
  className?: string;
  draggable?: boolean;
  fontSize?: number; // px
  /** Maximum chapter textarea height in pixels (optional). If omitted the component
      reads the CSS `max-height` (or falls back to 480). */
  maxHeight?: number;
  fontFamily?: string;
  fontWeight?: 400 | 500 | 600;
  "aria-grabbed"?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onChange: (text: string) => void;
  onAddAfter: (text?: string) => void;
  onAddBefore: (text?: string) => void;
  onDelete: () => void;
  onSplit: (beforeText: string, remainderText: string) => void;
  onGoto?: () => void;
}) {

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  // whether the user has interacted (clicked/focused) this textarea — used
  // to allow internal scrolling only after explicit interaction
  const interactiveRef = React.useRef(false);

  React.useEffect(() => {
    if (props.autoFocus) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        // move caret to start of textarea when focusing a freshly-created chapter
        textareaRef.current?.setSelectionRange(0, 0);
        textareaRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
        // ensure newly-focused textarea is correctly sized
        autosize();
      });
    }
  }, [props.autoFocus]);

  // autosize: grow until max-height, then allow internal scrolling
  function autosize() {
    const ta = textareaRef.current;
    if (!ta) return;
    // reset to measure content height
    ta.style.height = "auto";

    // prefer explicit prop, otherwise read max-height from computed style (fallback to 480)
    const cs = getComputedStyle(ta);
    const fromProp =
      typeof props.maxHeight === "number" ? props.maxHeight : undefined;
    const parsed = fromProp ?? (parseFloat(cs.maxHeight || "480") || 480);
    const maxH = Math.max(48, parsed);

    const newH = Math.min(ta.scrollHeight, maxH);
    ta.style.height = `${newH}px`;

    // only allow internal scrolling when content overflows AND the user has
    // interacted (clicked/focused) the textarea — otherwise keep overflow hidden
    const allowInnerScroll = ta.scrollHeight > maxH && interactiveRef.current;
    ta.style.overflowY = allowInnerScroll ? "auto" : "hidden";
  }

  // initial sizing and when text changes (including programmatic changes like split)
  React.useEffect(() => {
    autosize();
  }, []);

  React.useEffect(() => {
    autosize();
  }, [props.text]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Mod+Enter → add empty chapter after and focus it
    if (mod && e.key === "Enter") {
      e.preventDefault();
      props.onAddAfter("");
      return;
    }

    // Shift+Enter → split chapter at cursor (move text after cursor into a new chapter)
    if (e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      const ta = textareaRef.current!;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      // delegate a single, atomic split to the parent (parent should update this chapter
      // and insert the remainder as a new chapter so it can create a single undo entry)
      props.onSplit(before, after);
      return;
    }

    // Mod+Backspace on empty → delete chapter
    if (mod && e.key === "Backspace") {
      if (!textareaRef.current?.value) {
        e.preventDefault();
        props.onDelete();
      }
    }
  }

  return (
    <div
      className={[
        "group grid grid-cols-[34px_1fr] gap-0 items-stretch",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-chapter-id={props.id}
      role="listitem"
      onDragEnter={(e) => props.onDragEnter?.(e)}
      onDragOver={(e) => props.onDragOver?.(e)}
      onDrop={(e) => props.onDrop?.(e)}
      onDragEnd={(e) => props.onDragEnd?.(e)}
    >
      <div className="h-full flex items-center justify-center">
        <div
          role="button"
          aria-label="Drag to reorder chapter"
          tabIndex={0}
          draggable={props.draggable}
          aria-grabbed={props["aria-grabbed"] ? "true" : undefined}
          onDragStart={(e) => props.onDragStart?.(e)}
          onDragEnd={(e) => props.onDragEnd?.(e)}
          onClick={() => {
            props.onGoto?.();
          }}
          title="Drag to reorder"
          className="w-6 h-full min-h-[64px] rounded-md bg-[color:var(--accent)] border-[color:var(--accent)]/30 grid place-items-center text-white/90 text-xs cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40"
        >
          ≡
        </div>
      </div>

      <div className="relative rounded-md border border-white/10 bg-white/2 px-4 py-3">
        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
          <button
            title="Add chapter before"
            onClick={() => props.onAddBefore()}
            className="w-8 h-8 rounded-md bg-white/3 hover:bg-white/5 text-white/60"
          >
            <Icon name="arrow-up" aria-hidden width={16} />
          </button>
          <button
            title="Add chapter after"
            onClick={() => props.onAddAfter()}
            className="w-8 h-8 rounded-md bg-white/3 hover:bg-white/5 text-white/60"
          >
            <Icon name="arrow-down" aria-hidden width={16} />
          </button>
          <button
            title="Delete chapter"
            onClick={props.onDelete}
            className="w-8 h-8 rounded-md bg-rose-600/10 hover:bg-rose-600/20 text-rose-400"
          >
            <Icon name="trash-empty" title="Delete chapter" width={16} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          data-chapter-textarea={props.id}
          aria-label={`Chapter ${props.id}`}
          value={props.text}
          onChange={(e) => {
            props.onChange(e.target.value);
            autosize();
          }}
          onInput={() => autosize()}
          onKeyDown={onKeyDown}
          onFocus={() => {
            interactiveRef.current = true;
            autosize();
          }}
          onBlur={() => {
            interactiveRef.current = false;
            autosize();
          }}
          onPointerDown={() => {
            interactiveRef.current = true;
            // immediate feedback for pointer users
            autosize();
          }}
          onTouchStart={() => {
            interactiveRef.current = true;
            autosize();
          }}
          onMouseOut={() => {
            interactiveRef.current = false;
            autosize();
          }}
          className="w-full resize-none bg-transparent outline-none text-white/90 leading-relaxed min-h-[64px] max-h-[280px]"
          placeholder="Write a chapter..."
          style={{
            overflowY: "hidden",
            fontSize: props.fontSize ? `${props.fontSize}px` : undefined,
            fontFamily: props.fontFamily
              ? `${props.fontFamily}, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial`
              : undefined,
            fontWeight: props.fontWeight ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
