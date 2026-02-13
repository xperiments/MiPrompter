import React, { useEffect, useRef, useState } from "react";
import Icon from "../Icon";

export function AddScriptModal(props: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setName("");
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      onMouseDown={props.onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-[520px] rounded-lg bg-[color:var(--bg-2)] border border-[color:var(--line)] shadow-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-10 px-4 flex items-center justify-between border-b border-[color:var(--line)] bg-[color:var(--bg-2)]">
          <div className="text-sm text-white/80">Add Script…</div>
          <button
            className="w-8 h-8 rounded-md hover:bg-white/5 text-white/60"
            onClick={props.onClose}
          >
            <Icon name="close" width={16} aria-hidden />
          </button>
        </div>

        <div className="p-4">
          <div className="text-xs text-white/55 mb-2">Script Name:</div>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-9 px-3 rounded-md bg-black/30 border border-white/10 text-sm text-white/90 outline-none"
            placeholder="e.g. Intro A-roll"
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="h-9 px-4 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button
              className={[
                "h-9 px-4 rounded-md border text-white",
                name.trim().length
                  ? "bg-[color:var(--accent)]/90 border-white/10 hover:bg-[color:var(--accent)]"
                  : "bg-white/5 border-white/10 text-white/30 cursor-not-allowed",
              ].join(" ")}
              onClick={() => name.trim().length && props.onAdd(name.trim())}
              disabled={!name.trim().length}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
