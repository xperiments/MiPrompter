import React from "react";

export default function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-3">
      <div className="text-xs text-white/55">{props.label}</div>
      <div>{props.children}</div>
    </div>
  );
}
