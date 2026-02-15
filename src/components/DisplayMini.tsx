import React from "react";
import type { ScreenInfo } from "../lib/presenter";

export default function DisplayMini({
  screen,
  selected,
  onSelect,
}: {
  screen: ScreenInfo;
  selected?: boolean;
  onSelect: () => void;
}) {
  // miniature sizing (fit within 120x80)
  const maxW = 120;
  const maxH = 80;
  const aspect = Math.max(0.1, screen.width / (screen.height || 1));
  let w = maxW;
  let h = Math.round(w / aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * aspect);
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-2 white/6 bg-white/3 hover:bg-white/4 text-left ${
        selected ? "bg-black/10" : ""
      }`}
      title={screen.label}
    >
      <div style={{ width: 120 }} className="flex items-center gap-3">
        <div className="flex-shrink-0 border border-white/20 rounded-md" style={{ width: w, height: h }} />
        <div className="flex-1">
          <div className="text-sm text-white/90 truncate">{screen.label}</div>
          <div className="text-xs text-white/50">{Math.round(screen.width)}×{Math.round(screen.height)}</div>
        </div>
      </div>
    </button>
  );
}
