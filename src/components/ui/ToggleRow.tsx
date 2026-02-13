import React from "react";
import { Toggle } from "./Toggle";

export function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <div className="text-xs text-white/55">{props.label}</div>
        <div className="text-sm text-white/40">{props.description}</div>
      </div>
      <div>
        <Toggle checked={props.checked} onChange={props.onChange} />
      </div>
    </div>
  );
}

export default ToggleRow;
