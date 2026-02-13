import React from "react";
import Icon from "../Icon";

const TransportButton = (props: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: "red" | "green";
  disabled?: boolean;
}) => {
  const disabledClass =
    "opacity-50 cursor-not-allowed bg-white/3 border-white/6 text-white/40";

  const activeClass = props.disabled
    ? disabledClass
    : props.active
      ? props.activeColor === "red"
        ? "bg-red-500/20 border-red-500 text-red-100 animate-pulse"
        : "bg-green-500/20 border-green-500 text-green-100"
      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10";

  return (
    <button
      title={props.title}
      onClick={props.disabled ? undefined : props.onClick}
      disabled={props.disabled}
      aria-disabled={props.disabled}
      tabIndex={props.disabled ? -1 : 0}
      className={`w-10 h-10 rounded-full border transition-colors duration-200 grid place-items-center ${activeClass}`}
    >
      {props.children}
    </button>
  );
}


export function BottomBar(props: {
  fontSize?: number;
  onPlay?: () => void; // "Play/Pause"
  onToggleMic?: () => void; // "Mic"
  onRestart?: () => void; // "Restart"
  presenterWindowOpen?: boolean;
  micActive?: boolean;
  playing?: boolean;
}) {
  const fontSize = props.fontSize ?? 15;

  return (
    <div className="h-14 border-t border-[color:var(--line)] bg-[color:var(--bg-0)] px-4 flex items-center gap-3">
      <div className="flex-1" />

      <TransportButton
        title="Mic"
        onClick={props.onToggleMic}
        active={props.micActive}
        activeColor="red"
      >
        <Icon
          name={props.micActive ? "microphone-off" : "microphone"}
          width="24"
        />
      </TransportButton>

      <TransportButton title="Restart Script" onClick={props.onRestart}>
        <Icon name="repeat" width="24" title="Restart script" />
      </TransportButton>

      <div className="flex-1" />
    </div>
  );
}
