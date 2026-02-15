import React from "react";
import Icon from "./Icon";

export function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{
    id: T;
    /** visible label (string or node) */
    label?: React.ReactNode;
    /** optional icon name (from src/icons) or a ReactNode — icon takes precedence over label */
    icon?: string | React.ReactNode;
  }>;
}) {
  return (
    <div className="inline-flex ui-inset rounded-md p-1 gap-1">
      {props.items.map((it) => (
        <button
          key={it.id}
          onClick={() => props.onChange(it.id)}
          className={[
            "h-7 px-4 rounded-md text-xs",
            props.value === it.id ? "bg-[color:var(--accent)] text-white" : "text-white/70 hover:bg-white/5",
          ].join(" ")}
        >
          {it.icon ? (
            typeof it.icon === 'string' ? (
              <Icon name={it.icon} className="w-4 h-4" aria-hidden />
            ) : (
              it.icon
            )
          ) : (
            it.label
          )}
        </button>
      ))}
    </div>
  );
}
