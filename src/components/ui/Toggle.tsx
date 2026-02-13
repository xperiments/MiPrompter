import React from "react";

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.checked)}
      className={[
        "w-12 h-6 rounded-full border transition relative",
        props.checked ? "bg-[color:var(--accent)]/90 border-white/10" : "bg-black/30 border-white/15",
      ].join(" ")}
      aria-pressed={props.checked}
    >
      <span
        className={[
          "absolute top-0.5 w-5 h-5 rounded-full bg-white transition",
          props.checked ? "left-6" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}
