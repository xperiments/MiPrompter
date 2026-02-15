import React from "react";
import Icon from "./Icon";
import StageSourceChip, { type StagePlacedSource } from "./StageSourceChip";
import type { ScreenInfo } from "../lib/presenter";

type Props = {
  centerContainerRef: React.RefObject<HTMLDivElement>;
  stageRef: React.RefObject<HTMLDivElement>;
  renderedWidth: number;
  renderedHeight: number;
  isDragOverStage: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  selectedScreen?: ScreenInfo | null;
  targetW: number;
  targetH: number;
  stageSources: StagePlacedSource[];
  cameraPermission?: "granted" | "denied" | "prompt";
  localStreams?: Record<string, MediaStream | null>;
  onRemoveStageSource: (sourceId: string) => void;
};

export default function StagePreview({
  centerContainerRef,
  stageRef,
  renderedWidth,
  renderedHeight,
  isDragOverStage,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  selectedScreen,
  targetW,
  targetH,
  stageSources,
  cameraPermission,
  localStreams,
  onRemoveStageSource,
}: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div
        className="w-full max-w-3xl h-full p-6 flex items-center justify-center"
        ref={centerContainerRef}
      >
        <div
          className={`relative bg-white/3 border border-white/8 rounded-2xl transition-all ${
            isDragOverStage ? "ring-4 ring-blue-500/30" : ""
          }`}
          style={{
            width: renderedWidth,
            height: renderedHeight,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            maxHeight: "50vh",
          }}
          ref={stageRef}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Stage content (preview surface) */}
          <div className="absolute left-4 top-4 flex items-center gap-3">
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-black/30 text-xs text-white/90">
              <Icon name="monitor" width={14} height={14} />
              <div className="whitespace-nowrap">{selectedScreen?.label}</div>
            </div>

            {selectedScreen?.isPrimary ? (
              <div className="px-2 py-1 rounded-full bg-white/6 text-xs text-white/80">Primary</div>
            ) : null}

            <div className="ml-2 px-2 py-1 rounded-full bg-white/6 text-xs text-white/80">{`${Math.round(
              targetW,
            )}×${Math.round(targetH)}`}</div>

            <div className="ml-2 px-2 py-1 rounded-full bg-white/6 text-xs text-white/80">
              {stageSources.length} source{stageSources.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Center overlay to simulate the prompter surface */}
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-6xl font-semibold select-none">
            PREVIEW
          </div>

          {/* Stage placed sources (tiles) */}
          <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
            {stageSources.map((p) => (
              <StageSourceChip
                key={p.sourceId}
                placed={p}
                cameraPermission={cameraPermission}

                localStreams={localStreams}
                onRemove={() => onRemoveStageSource(p.sourceId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
