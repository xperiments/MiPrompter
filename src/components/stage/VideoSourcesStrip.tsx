import React from "react";
import Icon from "../ui/Icon";
import VideoSourceCard, { type VideoSource } from "./VideoSourceCard";

type Props = {
  videoSources: VideoSource[];
  onShareScreen: () => Promise<void> | void;
  cameraPermission?: "granted" | "denied" | "prompt";
  requestCameraPermission?: (deviceId?: string) => Promise<boolean>;
  onDragStart?: (id: string) => void;
};

export default function VideoSourcesStrip({
  videoSources,
  onShareScreen,
  cameraPermission,
  requestCameraPermission,
  onDragStart,
}: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      <div
        role="button"
        tabIndex={0}
        onClick={onShareScreen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onShareScreen();
        }}
        className="flex-shrink-0 min-w-[200px] w-56 h-36 relative overflow-hidden rounded-sm bg-black/10 flex items-center justify-center cursor-pointer text-white/70"
        title="Share screen/window"
        aria-label="Share screen or window"
      >
        <div className="flex flex-col items-center gap-2">
          <Icon name="plus" width={28} height={28} />
          <div className="text-sm">Share screen</div>
        </div>
      </div>

      {videoSources.length === 0 ? (
        <div className="text-sm text-white/50">No video sources detected</div>
      ) : (
        videoSources.map((src) => (
          <VideoSourceCard
            key={src.id}
            source={src}
            cameraPermission={cameraPermission}
            requestCameraPermission={requestCameraPermission}
            onDragStart={onDragStart}
          />
        ))
      )}
    </div>
  );
}
