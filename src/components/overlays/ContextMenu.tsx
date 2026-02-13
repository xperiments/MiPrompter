import React, { useEffect } from "react";

export function ContextMenu(props: {
  open: boolean;
  x: number;
  y: number;
  items: { label: string; hint?: string; disabled?: boolean }[];
  onClose: () => void;
  onSelect?: (label: string) => void;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    const onClick = () => props.onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      className="fixed z-[60] w-[260px] rounded-md bg-[color:var(--bg-2)] border border-white/10 shadow-soft overflow-hidden"
      style={{ left: props.x, top: props.y, backgroundColor: "var(--bg-2)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {props.items.map((it, idx) => {
        if (it.label === "—") {
          return <div key={idx} className="h-px bg-white/10 my-1" />;
        }
        return (
          <button
            key={idx}
            disabled={it.disabled}
            className={[
              "w-full px-3 py-2 text-left text-sm flex items-center justify-between",
              it.disabled ? "text-white/25" : "text-white/80 hover:bg-white/5",
            ].join(" ")}
            onClick={() => {
              if (it.disabled) return;
              try {
                props.onSelect?.(it.label);
              } catch (_) {}
              props.onClose();
            }}
          >
            <span>{it.label}</span>
            {it.hint && (
              <span className="text-xs text-white/35">{it.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
