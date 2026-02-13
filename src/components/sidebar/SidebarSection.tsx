import React, { useState, useMemo } from "react";
import Icon from "../Icon";

export function SidebarSection(props: { icon?: string; title: string; defaultOpen?: boolean; storageKey?: string; children: React.ReactNode }) {
  const storageKey = useMemo(() => {
    const id = props.storageKey ?? props.title.replace(/\s+/g, "-").toLowerCase();
    return `smui.sidebar.${encodeURIComponent(id)}.open`;
  }, [props.storageKey, props.title]);

  const readInitial = () => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (_) {}
    return props.defaultOpen ?? false;
  };

  const [open, setOpen] = useState<boolean>(readInitial);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch (_) {}
  };

  return (
    <div className="border-b border-[color:var(--line)]">
      <button
        className="w-full h-10 px-3 flex items-center gap-2 bg-white/3 hover:bg-white/5"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={storageKey + "-panel"}
      >
        <span className="text-white/60 text-xs">{open ? "▼" : "▶"}</span>
      {props.icon && <Icon name={props.icon} width={24} className="text-white/40 ml-1" aria-hidden />}
        <span className="text-sm text-white/85">{props.title}</span>
      </button>
      {open && (
        <div id={storageKey + "-panel"} className="pt-2 pb-4 pr-4 pl-4">
          {props.children}
        </div>
      )}
    </div>
  );
}
