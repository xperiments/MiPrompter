import React, { useState } from "react";
import Icon from "../Icon";

export function TopBar(props: {
  contentFontSize?: number;
  onChangeContentFontSize?: (v: number) => void;
  contentWidthPct?: number;
  onChangeContentWidthPct?: (v: number) => void;
}) {
  const fontSize = props.contentFontSize ?? 15;

  return (
    <div className="h-14 border-t border-[color:var(--line)] bg-[color:var(--bg-0)] px-4 flex items-center gap-3">
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xs text-white/55">
            <Icon name="text" width={26} aria-hidden />
          </div>
          <input
            aria-label="Editor font size"
            className="w-48 accent-[color:var(--accent)]"
            type="range"
            min={12}
            max={80}
            value={props.contentFontSize ?? 15}
            onChange={(e) =>
              props.onChangeContentFontSize?.(Number(e.target.value))
            }
          />
          <div className="w-12 text-left text-xs text-white/70 tabular-nums">
            {props.contentFontSize ?? 15}px
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-white/55">
            <Icon name="display-code" width={26} aria-hidden />
          </div>
          <input
            aria-label="Editor width"
            className="w-40 accent-[color:var(--accent)]"
            type="range"
            min={30}
            max={100}
            value={props.contentWidthPct ?? 64}
            onChange={(e) =>
              props.onChangeContentWidthPct?.(
                Math.round(Number(e.target.value)),
              )
            }
          />
          <div className="w-10 text-left text-xs text-white/70 tabular-nums">
            {props.contentWidthPct ?? 64}%
          </div>
        </div>
      </div>
    </div>
  );
}