import React, { useState, useMemo } from "react";
import Icon from "../ui/Icon";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { sidebarSectionKey } from "../../lib/keys";

export function SidebarSection(props: { icon?: string; title: string; defaultOpen?: boolean; storageKey?: string; forceOpen?: boolean; children: React.ReactNode }) {
  const storageKey = useMemo(() => {
    const id = props.storageKey ?? props.title.replace(/\s+/g, "-").toLowerCase();
    return sidebarSectionKey(id);
  }, [props.storageKey, props.title]);

  const ls = useLocalStorage();
  const readInitial = () => {

      const v = ls.getRaw(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;

    return props.defaultOpen ?? false;
  };

  const [open, setOpen] = useState<boolean>(readInitial);

  // when `forceOpen` is true, always render open and prevent toggling
  const effectiveOpen = props.forceOpen ? true : open;

  const toggle = () => {
    if (props.forceOpen) return; // no-op when forced open

    const next = !open;
    setOpen(next);

    ls.setRaw(storageKey, next ? "1" : "0");
  };

  return (
    <div className="border-b border-[color:var(--line)]">
      <button
        className="w-full h-10 px-3 flex items-center gap-2 bg-white/3 hover:bg-white/5"
        onClick={toggle}
        aria-expanded={effectiveOpen}
        aria-controls={storageKey + "-panel"}
        disabled={props.forceOpen}
      >
        <span className="text-white/60 text-xs">{open ? "▼" : "▶"}</span>
      {props.icon && <Icon name={props.icon} width={24} className="text-white/40 ml-1" aria-hidden />}
        <span className="text-sm text-white/85">{props.title}</span>
      </button>
      {effectiveOpen && (
        <div id={storageKey + "-panel"} className="pt-2 pb-4 pr-4 pl-4">
          {props.children}
        </div>
      )}
    </div>
  );
}
