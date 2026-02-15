import React, { useMemo } from "react";
import { ScriptList } from "../sidebar/ScriptList";
import { EVT_OPEN_SIDEBAR_SECTION } from "../../lib/keys";

export default function MicrophoneSelect(props: {
  mics: Array<{ deviceId: string; label: string }>;
  selected: string | null;
  onChange: (deviceId: string) => void;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
}) {
  const { mics, selected, loading, error, onRefresh } = props;

  const items = useMemo(() => {
    if (mics.length)
      return mics.map((m) => ({
        id: m.deviceId,
        label: m.label.replace(/\s*\([^)]*\)$/, ""),
      }));
    if (selected) return [{ id: selected, label: `Selected — ${selected.slice(0, 6)}` }];
    return [
      {
        id: "",
        label: loading ? "Detecting…" : (error ?? "No microphones found"),
      },
    ];
  }, [mics, selected, loading, error]);

  return (
    <ScriptList
      items={items}
      activeId={selected ?? ""}
      onSelect={(id) => {
        props.onChange(id);
        window.dispatchEvent(
          new CustomEvent(EVT_OPEN_SIDEBAR_SECTION, {
            detail: { title: "Display Options" },
          }),
        );
      }}
      onRefresh={onRefresh}
    />
  );
}
