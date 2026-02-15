import React from "react";
import Icon from "../ui/Icon";
import StageSourceChip, { type StagePlacedSource } from "./StageSourceChip";
import type { ScreenInfo } from "../../lib/presenter";

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
