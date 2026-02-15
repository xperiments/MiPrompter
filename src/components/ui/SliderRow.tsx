import React from "react";

export function SliderRow(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Called when the user finishes interaction (mouseUp / touchEnd / blur) */
  onChangeEnd?: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;

  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3">
      <div className="text-xs text-white/55">{props.label}</div>
      <div className="flex items-center gap-3">
        <input
          className="flex-1 accent-[color:var(--accent)]"
          type="range"
          min={min}
          max={max}
          value={props.value}
          onChange={(e) => props.onChange(parseInt(e.target.value, 10))}
          onMouseUp={() => props.onChangeEnd?.(props.value)}
          onTouchEnd={() => props.onChangeEnd?.(props.value)}
          onBlur={() => props.onChangeEnd?.(props.value)}
          onKeyUp={(e) => { if (e.key === 'Enter') props.onChangeEnd?.(props.value); }}
        />
        <div className="w-14 text-right text-xs text-white/70 ui-inset rounded-md px-2 py-1">
          {props.value} {props.unit ?? ""}
        </div>
      </div>
    </div>
  );
}
