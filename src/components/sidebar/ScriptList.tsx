import React from "react";
import type { ScriptDoc } from "../../types";
import Icon from "../Icon";

export function ScriptList(props: {
  /** Generic items: use `name` or `label` for display */
  items: Array<{ id: string; name?: string; label?: string }>;
  activeId: string;
  onSelect: (id: string) => void;
  /** Optional actions: keep existing script add/remove or provide a single refresh action for device lists */
  onAdd?: () => void;
  onRemove?: () => void;
  onRefresh?: () => void;
}) {
  return (
    <div className="ui-inset rounded-lg p-2">
      <div className="max-h-[140px] overflow-auto rounded-md">
        {props.items.map((d) => {
          const label = d.name ?? d.label ?? d.id;
          return (
            <button
              key={d.id}
              onClick={() => props.onSelect(d.id)}
              aria-current={d.id === props.activeId ? "true" : undefined}
              className={[
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40",
                d.id === props.activeId ? "bg-[color:var(--accent)] text-white font-semibold" : "text-white/60 hover:bg-white/6",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-end gap-2">
        {props.onRefresh ? (
          <MiniIconButton title="Refresh" onClick={props.onRefresh}>
            <Icon name="repeat" width="16" title="Refresh" />
          </MiniIconButton>
        ) : (
          <>
            {props.onAdd ? (
              <MiniIconButton title="Add" onClick={props.onAdd}>
                <Icon name="plus" width="16" title="Add" />
              </MiniIconButton>
            ) : null}
            {props.onRemove ? (
              <MiniIconButton title="Remove" onClick={props.onRemove}>
                <Icon name="minus" width="16" title="Remove" />
              </MiniIconButton>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MiniIconButton(props: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 text-white/70 grid place-items-center"
    >
      {props.children}
    </button>
  );
}
