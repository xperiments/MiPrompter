import React from "react";
import Icon from "./ui/Icon";

export function AppShell(props: {
  left: React.ReactNode;
  main: React.ReactNode;
  composer?: React.ReactNode;
  overlay?: React.ReactNode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onFullscreenChange?: (isFs: boolean) => void;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"editor" | "composer">(
    "editor",
  );

  React.useEffect(() => {
    const onChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isFs);
      props.onFullscreenChange?.(isFs);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [props]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // toggle fullscreen with `F` (when not typing in an input/textarea)
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await panelRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
      props.onFullscreenChange?.(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
      props.onFullscreenChange?.(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-2">
      <div
        ref={panelRef}
        className={[
          // make the shell responsive: remove the hard `max-w`/fixed `h` so it fills available space
          "w-full h-[92vh] max-h-[96vh] rounded-xl shadow-soft overflow-hidden bg-[color:var(--bg-0)] text-[color:var(--text)]",
          isFullscreen && "fixed inset-0 w-full h-full rounded-none p-0 z-[70]",
        ]
          .filter(Boolean)
          .join(" ")}
        style={isFullscreen ? { margin: 0 } : undefined}
      >
        {/* top chrome */}
        <div className="h-12 px-3 flex items-center justify-between border-b border-[color:var(--line)] bg-[color:var(--bg-0)]">
          <div className="flex items-center gap-3">
            <button
              title={
                props.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              onClick={props.onToggleSidebar}
              className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 grid place-items-center text-sm"
            >
              <Icon name="burger-menu" width={16} aria-hidden />
            </button>
            <div className="text-sm text-white/80">MPi Prompter</div>
          </div>

          <div className="flex items-center gap-2">
            <IconButton
              title={isFullscreen ? "Exit full screen" : "Full screen"}
              aria-pressed={isFullscreen}
              onClick={toggleFullscreen}
            >
              <Icon
                name={isFullscreen ? "fullscreen-exit" : "fullscreen"}
                title={isFullscreen ? "Exit full screen" : "Full screen"}
                width={16}
                aria-hidden
              />
            </IconButton>
          </div>
        </div>

        {/* content */}
        <div className="h-[calc(100%-48px)] flex bg-[color:var(--bg-1)]">
          {props.sidebarCollapsed ? (
            <div className="w-14 border-r border-[color:var(--line)] bg-[color:var(--bg-2)] flex items-start justify-center">
              <div className="mt-3">
                <button
                  title="Expand sidebar"
                  onClick={props.onToggleSidebar}
                  className="w-8 h-8 rounded-md bg-white/3 hover:bg-white/5 border border-white/10 text-white/70 grid place-items-center"
                >
                  <Icon name="burger-menu" width={16} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div className="w-[380px] border-r border-[color:var(--line)] bg-[color:var(--bg-2)]">
              {props.left}
            </div>
          )}

          <div className="flex-1 bg-[color:var(--bg-1)]">
            <div className="h-full flex flex-col">
              <div className="px-3 py-2 flex items-center gap-2 border-b border-[color:var(--line)] bg-[color:var(--bg-0)]">
                <button
                  onClick={() => setActiveTab("editor")}
                  aria-pressed={activeTab === "editor"}
                  className={`px-3 py-1 rounded-md text-sm ${activeTab === "editor" ? "bg-white/6 border border-white/10 text-white" : "text-white/60 hover:bg-white/3"}`}
                >
                  Editor
                </button>

                <button
                  onClick={() => setActiveTab("composer")}
                  aria-pressed={activeTab === "composer"}
                  className={`px-3 py-1 rounded-md text-sm ${activeTab === "composer" ? "bg-white/6 border border-white/10 text-white" : "text-white/60 hover:bg-white/3"}`}
                >
                  Composer
                </button>
              </div>

              <div className="flex-1 overflow-auto">
                {activeTab === "editor" ? props.main : props.composer}
              </div>
            </div>
          </div>
        </div>

        {props.overlay}
      </div>
    </div>
  );
}

function IconButton(props: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  ariaPressed?: boolean;
}) {
  return (
    <button
      title={props.title}
      aria-pressed={props.ariaPressed}
      onClick={props.onClick}
      className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 grid place-items-center text-sm"
    >
      {props.children}
    </button>
  );
}
