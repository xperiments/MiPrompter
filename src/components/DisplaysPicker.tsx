import React from "react";
import DisplayMini from "./DisplayMini";
import type { ScreenInfo } from "../lib/presenter";

type PairedDevice = {
  id: string;
  label?: string;
  ua?: string;
  screen?: { width?: number; height?: number };
  createdAt?: number;
  lastSeen?: number;
};

export default function DisplaysPicker({
  screens,
  pairedDevices,
  selectedDisplayId,
  onSelectDisplay,
  onSelectRemote,
}: {
  screens: ScreenInfo[];
  pairedDevices: PairedDevice[];
  selectedDisplayId: string | null;
  onSelectDisplay: (s: ScreenInfo) => void;
  onSelectRemote: (p: PairedDevice) => void;
}) {
  return (
    <div className="w-64">
      <h3 className="text-sm text-white/60 mb-3">Displays</h3>
      <div className="text-xs text-white/50 mb-2">
        Paired devices: {pairedDevices.length}
        {pairedDevices.length ? ` — ${pairedDevices.map((d) => d.id).join(", ")}` : ""}
      </div>
      <div className="space-y-3">
        {(screens || []).map((s) => (
          <DisplayMini key={s.id} screen={s} selected={s.id === selectedDisplayId} onSelect={() => onSelectDisplay(s)} />
        ))}

        {pairedDevices.length > 0 ? (
          <>
            <div className="h-px bg-white/8 my-2" />
            {pairedDevices.map((p) => {
              const id = `remote:${p.id}`;
              const screenInfo = {
                id,
                left: 0,
                top: 0,
                width: p.screen?.width ?? 1280,
                height: p.screen?.height ?? 720,
                label: p.label ?? `Remote ${p.id}`,
              } as ScreenInfo;
              return (
                <DisplayMini key={id} screen={screenInfo} selected={selectedDisplayId === id} onSelect={() => onSelectRemote(p)} />
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}
