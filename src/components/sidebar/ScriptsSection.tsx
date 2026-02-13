import React, { memo } from "react";
import { SidebarSection } from "../sidebar/SidebarSection";
import { ScriptList } from "../sidebar/ScriptList";
import Icon from "../Icon";

type ScriptItem = { id: string; name?: string; label?: string };

type Props = {
  scripts: ScriptItem[];
  activeScriptId: string;
  onSelectScript: (id: string) => void;
  onAddScript: () => void;
  onRemoveScript: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

function ScriptsSection({
  scripts,
  activeScriptId,
  onSelectScript,
  onAddScript,
  onRemoveScript,
  onExport,
  onImport,
}: Props) {
  return (
    <SidebarSection title="Scripts" defaultOpen icon="text-align-left">
      <div className="space-y-3">
        <ScriptList
          items={scripts as any}
          activeId={activeScriptId}
          onSelect={onSelectScript}
          onAdd={onAddScript}
          onRemove={onRemoveScript}
        />

        <div className="mt-3 flex gap-2">
          <button
            className="flex-1 h-9 rounded-md bg-white/5 text-xs text-white/80"
            onClick={onExport}
          >
            Export
          </button>

          <label className="w-9 h-9 rounded-md bg-white/5 text-white/70 grid place-items-center cursor-pointer">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onImport}
            />
            <Icon name="upload" className="w-5 h-5" title="Import scripts" />
          </label>
        </div>
      </div>
    </SidebarSection>
  );
}

export default memo(ScriptsSection);
