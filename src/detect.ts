// detect.ts
export type PlatformInfo = {
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isSafari: boolean;
  isStandalone: boolean; // iOS/Android installed PWA / standalone
  orientation: "portrait" | "landscape";
  angle: number | null;  // best-effort (mostly Android / some browsers)
};

export function getPlatformInfo(): PlatformInfo {
  const nav = window.navigator as Navigator & { standalone?: boolean };

  const ua = navigator.userAgent || "";
  const platform = (navigator.platform || "").toLowerCase();
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // iPadOS lies as "Mac" sometimes; touchpoints helps
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (platform.includes("mac") && maxTouchPoints > 1);

  const isAndroid = /android/i.test(ua);

  const isMobile =
    isAndroid ||
    isIOS ||
    /mobile/i.test(ua) ||
    maxTouchPoints > 1;

  // Safari-ish (useful for iOS fullscreen quirks)
  const isSafari =
    /safari/i.test(ua) &&
    !/chrome|crios|android|fxios|edgios/i.test(ua);

  // Standalone / installed PWA
  const isStandalone =
    (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
    (nav.standalone === true); // iOS Safari legacy

  // Orientation (reliable): use viewport ratio
  const orientation =
    window.matchMedia?.("(orientation: portrait)")?.matches
      ? "portrait"
      : "landscape";

  // Angle (best effort)
  let angleVal: number | null = null;
  if (screen.orientation && typeof screen.orientation.angle === "number") {
    angleVal = screen.orientation.angle;
  } else {
    const wOrientation = (window as unknown as { orientation?: number }).orientation;
    angleVal = typeof wOrientation === "number" ? wOrientation : null;
  }
  const angle: number | null = angleVal;

  return { isIOS, isAndroid, isMobile, isSafari, isStandalone, orientation, angle };
}

export function onOrientationChange(cb: (info: PlatformInfo) => void) {
  // Best: orientation media query (fires on rotate)
  const mql = window.matchMedia?.("(orientation: portrait)");

  const fire = () => cb(getPlatformInfo());

  if (mql?.addEventListener) {
    mql.addEventListener("change", fire);
  } else if (mql?.addListener) {
    // Safari < 14
    mql.addListener(fire);
  }

  // Fallbacks for browsers that are weird about MQ events
  window.addEventListener("orientationchange", fire, { passive: true });
  window.addEventListener("resize", fire, { passive: true });

  // initial
  fire();

  return () => {
    if (mql?.removeEventListener) mql.removeEventListener("change", fire);
    else if (mql?.removeListener) mql.removeListener(fire);

    window.removeEventListener("orientationchange", fire);
    window.removeEventListener("resize", fire);
  };
}