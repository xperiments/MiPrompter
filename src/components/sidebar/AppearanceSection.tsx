import React, { memo } from "react";
import { SidebarSection } from "../sidebar/SidebarSection";
import { Select } from "../ui/Select";
import { SliderRow } from "../ui/SliderRow";
import { Segmented } from "../ui/Segmented";
import { Toggle } from "../ui/Toggle";
import { ToggleRow } from "../ui/ToggleRow";

type PresenterShape = any;

type Props = {
  presenter: PresenterShape;
  presenterPreview: Partial<PresenterShape> | null;
  setPresenterPreview: (p: Partial<PresenterShape> | null) => void;
  handleAlignmentChange: (v: string) => void;
  handleSliderChange: (k: keyof PresenterShape) => (v: number) => void;
  handleToggle: (k: keyof PresenterShape) => (v: boolean) => void;
  updatePresenterAppearance: (u: Partial<PresenterShape>) => void;
  presenterWindowRef?: React.MutableRefObject<Window | null>;
};

function AppearanceSection({
  presenter,
  presenterPreview,
  setPresenterPreview,
  handleAlignmentChange,
  handleSliderChange,
  handleToggle,
  updatePresenterAppearance,
  presenterWindowRef,
}: Props) {
  return (
    <>
      <SidebarSection title="Appearance" icon="tune-3-knobs-horizontal">
        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>Alignment</div>
            </div>
            <Segmented
              value={presenter.alignment ?? "left"}
              onChange={handleAlignmentChange}
              items={[
                { id: "left", icon: "text-align-left" },
                { id: "center", icon: "text-align-justified" },
                { id: "right", icon: "text-align-right" },
              ]}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>Font</div>
            </div>
            <Select
              value={presenter.fontFamily ?? "Inter"}
              onChange={(v) => {
                updatePresenterAppearance({ fontFamily: v });
                try {
                  if (presenterWindowRef) {
                    // parent will call updatePresenterWindow when necessary
                  }
                } catch (_) {}
              }}
              options={[
                { value: "Inter", label: "Inter" },
                { value: "Open+Sans", label: "Open Sans" },
                { value: "Roboto", label: "Roboto" },
                { value: "Source+Sans+Pro", label: "Source Sans Pro" },
                { value: "Lato", label: "Lato" },
                { value: "Montserrat", label: "Montserrat" },
              ]}
            />
          </div>

          <SliderRow label="Font Size" value={presenter.fontSize ?? 40} onChange={handleSliderChange("fontSize")} unit="px" min={20} max={120} />

          <SliderRow label="Side Margins" value={presenter.sideMargins ?? 0} onChange={handleSliderChange("sideMargins")} unit="px" min={1} max={120} />

          <SliderRow label="Line Spacing" value={presenter.lineSpacing ?? 140} onChange={handleSliderChange("lineSpacing")} unit="x" min={80} max={200} />

          <SliderRow label="Paragraph Spacing" value={Math.round((presenter.paragraphSpacing ?? 0.5) * 20)} onChange={(v: number) => handleSliderChange("paragraphSpacing")(v / 20)} unit="em" min={0} max={40} />

          <SliderRow label="Active Line Position" value={presenter.activeLinePosition ?? 35} onChange={handleSliderChange("activeLinePosition")} unit="%" min={10} max={90} />

          <SliderRow
            label="Centerline height"
            value={presenterPreview?.activeLineGuideHeight ?? presenter.activeLineGuideHeight ?? 2}
            onChange={(v: number) => {
              setPresenterPreview((p: Partial<PresenterShape> | null) => ({ ...(p || {}), activeLineGuideHeight: v }));
              try {
                /* lightweight immediate update handled by parent */
              } catch (_) {}
            }}
            onChangeEnd={(v) => {
              setPresenterPreview(null);
              updatePresenterAppearance({ activeLineGuideHeight: v });
            }}
            unit="px"
            min={2}
            max={100}
          />
        </div>
      </SidebarSection>

      <SidebarSection title="Display Options" icon="cog">
        <div className="space-y-3">
          <ToggleRow
            label="Mirror Mode"
            description="Flip horizontally for teleprompter mirrors"
            checked={presenter.mirrorMode ?? false}
            onChange={handleToggle("mirrorMode")}
          />

          <ToggleRow
            label="Show Stop Signs"
            description="Show punctuation markers in the text"
            checked={presenter.showStopSigns ?? false}
            onChange={handleToggle("showStopSigns")}
          />

          <ToggleRow
            label="Rotate Screen"
            description="90° clockwise for iOS"
            checked={presenter.rotateScreen ?? false}
            onChange={handleToggle("rotateScreen")}
          />

          <ToggleRow
            label="Preserve Formatting"
            description="Preserve manual line breaks & paragraphs"
            checked={presenter.preserveFormatting ?? false}
            onChange={handleToggle("preserveFormatting")}
          />

          <ToggleRow
            label="Smooth Animations"
            description="Smoother scroll & highlighting"
            checked={presenter.smoothAnimations ?? false}
            onChange={handleToggle("smoothAnimations")}
          />

          <ToggleRow
            label="Highlight Active Word"
            description="Orange underline on current word"
            checked={presenter.highlightActiveWord ?? false}
            onChange={handleToggle("highlightActiveWord")}
          />

          <ToggleRow
            label="Show Centerline"
            description="Show the prominent centerline ruler on the presenter"
            checked={presenter.showCenterline ?? true}
            onChange={handleToggle("showCenterline")}
          />
        </div>
      </SidebarSection>
    </>
  );
}

export default memo(AppearanceSection);
