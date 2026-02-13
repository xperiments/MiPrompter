import React, { memo } from "react";
import { SidebarSection } from "../sidebar/SidebarSection";
import { ScriptList } from "../sidebar/ScriptList";

type ScreenInfo = { label: string; left?: number; top?: number; width?: number; height?: number; isPrimary?: boolean };

type Props = {
  screens: { screens: ScreenInfo[]; selectedScreenLabel?: string; refresh?: () => void } | null;
  activeScreenLabel: string | undefined;
  onSelectScreen: (id: string) => void;
  onRefresh?: () => void;
  presenterStatus?: string | null;
};

function DisplaysSection({ screens, activeScreenLabel, onSelectScreen, onRefresh, presenterStatus }: Props) {
  const items = screens && screens.screens.length
    ? screens.screens.map((s) => ({ id: s.label, label: s.label, isPrimary: s.isPrimary })).sort((a, b) =>
        a.isPrimary === b.isPrimary
          ? 0
          : a.isPrimary
          ? -1
          : 1
      )
    : [
        {
          id: `primary-${window.screen.width}x${window.screen.height}`,
          label: `Primary — ${window.screen.width}×${window.screen.height}`,
          isPrimary: true,
        },
      ];




  return (
    <SidebarSection title="Displays" icon="monitor">
      <div className="space-y-3">
        <ScriptList
          items={items as any}
          activeId={activeScreenLabel ?? ""}
          onSelect={onSelectScreen}
          onRefresh={onRefresh}
        />

        <div className="w-full mt-2">
          {presenterStatus ? (
            <div className="text-xs text-white/60 px-2">{presenterStatus}</div>
          ) : null}
        </div>
      </div>
    </SidebarSection>
  );
}

export default memo(DisplaysSection);
