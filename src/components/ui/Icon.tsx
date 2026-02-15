import React from "react";
import { warn } from "../../lib/logger";

// Load raw SVG source from `src/icons` and inline it so CSS (currentColor) can style fills/strokes.
// Use Vite's import.meta.glob to eagerly load the files as raw strings.
const rawModules = (import.meta.glob('../../icons/*.svg', { as: 'raw', eager: true }) as Record<string, string>);

function normalizeSvg(raw: string) {
  // remove XML comments
  let s = raw.replace(/<!--([\s\S]*?)-->/g, "");
  // strip scripts and event handlers (minimal sanitization)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/\s(on[a-zA-Z]+)="[^"]*"/g, "");
  // remove hard width/height so SVG scales with CSS/attrs
  s = s.replace(/\s(width|height)="[^"]+"/g, "");
  // coerce fill/stroke to currentColor unless explicitly none or a URL (gradients)
  s = s.replace(/\s(fill|stroke)="([^"']+)"/g, (_m, attr, val) => {
    const v = (val || "").trim();
    if (!v || v === 'none' || v === 'currentColor' || v.startsWith('url(')) return ` ${attr}="${v}"`;
    return ` ${attr}="currentColor"`;
  });
  return s;
}

const SVG_CONTENTS: Record<string, string> = Object.fromEntries(
  Object.entries(rawModules).map(([p, raw]) => {
    const base = p.split('/').pop()!.replace(/\.svg$/, '');
    return [base, normalizeSvg(raw)];
  })
);

function injectTitle(svg: string, title: string) {
  if (!title) return svg;
  if (/\<title[\s\S]*?<\/title\>/i.test(svg)) {
    return svg.replace(/(\<title[\s\S]*?\<\/title\>)/i, `<title>${title}</title>`);
  }
  return svg.replace(/<svg([^>]*)>/i, `<svg$1><title>${title}</title>`);
}

function setSvgSize(svg: string, width?: number | string, height?: number | string) {
  const w = typeof width === 'number' ? `${width}px` : width;
  const h = typeof height === 'number' ? `${height}px` : height;
  if (w && h) return svg.replace(/<svg([^>]*)>/i, `<svg$1 style="display:inline-block" width=\"${w}\" height=\"${h}\">`);
  if (w) return svg.replace(/<svg([^>]*)>/i, `<svg$1 style="display:inline-block" width=\"${w}\" height=\"${w}\">`);
  if (h) return svg.replace(/<svg([^>]*)>/i, `<svg$1 style="display:inline-block" width=\"${h}\" height=\"${h}\">`);
  return svg;
}

export type IconProps = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  /** icon name (filename in `src/icons`, without .svg) */
  name: string;
  /** explicit width (px or CSS). When provided and `height` is omitted, `height === width` */
  width?: number | string;
  /** explicit height (px or CSS). When provided and `width` is omitted, `width === height` */
  height?: number | string;
  /** legacy shorthand for setting both width and height */
  size?: number | string;
  title?: string | null; // accessibility title; if null -> aria-hidden
  className?: string;
};

export const Icon = React.memo(function Icon({ name, size, width, height, title, className, ...rest }: IconProps) {
  const raw = SVG_CONTENTS[name];
  if (raw) {
    let svg = raw;
    svg = injectTitle(svg, title ?? '');

    // resolution precedence: explicit width/height -> size -> default(16)
    const resolvedWidth = width ?? (size ?? undefined) ?? "100%";
    const resolvedHeight = height ?? (size ?? undefined) ?? resolvedWidth;

    svg = setSvgSize(svg, resolvedWidth, resolvedHeight);

    // render SVG inline so CSS (currentColor) can recolor strokes/fills
    return (
      <div
        role={title ? 'img' : undefined}
        aria-hidden={title ? undefined : true}
        className={className}
        dangerouslySetInnerHTML={{ __html: svg }}
        {...rest}
      />
    );
  }

  // fallback: placeholder box
  if (import.meta.env.DEV) warn(`Icon: unknown icon name "${name}" — rendering fallback.`);
  const fbSize = size ?? width ?? height ?? "100%";
  return (
    <svg
      viewBox="0 0 24 24"
      width={fbSize}
      height={fbSize}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={className}
      {...(rest as React.SVGAttributes<SVGSVGElement>)}
    >
      {title ? <title>{title}</title> : null}
      <rect x={3} y={3} width={18} height={18} rx={3} fill="currentColor" opacity={0.12} />
      <text x="50%" y="55%" textAnchor="middle" fontSize={10} fill="currentColor">?</text>
    </svg>
  );
});

export default Icon;
