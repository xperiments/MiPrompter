import React from "react";

type SelectOption = string | { value: string; label: string };

export function Select(props: { value: string; options: SelectOption[]; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={"w-full h-9 pl-3 pr-9 rounded-md bg-black/30 border border-white/10 text-sm text-white/85 outline-none appearance-none -webkit-appearance-none -moz-appearance-none leading-9"}
      >
        {props.options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          )
        )}
      </select>

      {/* visual chevron — separate element so we don't rely on native arrows */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/60" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-90"><path d="M6 9l6 6 6-6"/></svg>
      </span>
    </div>
  );
}
