# Refactor Plan — MiPrompter

TL;DR — Small, incremental PRs to align the repo with the project's React best-practices document (`.github/instructions/react-best-practices.instructions.md`). Start with **Lint & Quick Wins** to reduce risk and then stabilize renders, add types and tests, and finally refactor heavier areas (Composer / App / Sidebar).

---

## 1) Findings — Top 20 issues (ranked by impact)

1. **Large monolithic `App` component**
   - Files: `src/App.tsx`
   - Why: many unrelated states and imperative logic in a single file; high surface for re-renders and maintenance.
   - Risk: **high**

2. **Large monolithic `Sidebar` component**
   - Files: `src/components/Sidebar.tsx`
   - Why: mixes device, speech, presenter and UI logic in one file; hard to test and reason about.
   - Risk: **high**

3. **Composer (canvas) does heavy main-thread work**
   - Files: `src/components/Composer.tsx`
   - Why: RAF + canvas drawing + stream management in component body; needs isolation and stronger lifecycle guarantees.
   - Risk: **high → medium**

4. **Unstable props / inline handlers causing re-renders**
   - Files: `src/components/ScriptArea.tsx`, `src/components/editor/ChapterBlock.tsx`
   - Why: inline closures passed to mapped children force unnecessary re-renders.
   - Risk: **medium**

5. **Overuse of `any` / weak TypeScript coverage**
   - Files: `src/lib/*`, `src/hooks/*`, `src/presenter.tsx`
   - Why: reduces refactor safety and increases runtime errors risk.
   - Risk: **medium–high**

6. **No unit/E2E tests or CI**
   - Files: repo-wide (no `__tests__`, no GitHub Actions)
   - Why: regression risk for core flows (presenter, speech, canvas).
   - Risk: **high**

7. **Console logs & warnings in runtime code**
   - Files: `src/hooks/useAppSpeechControl.ts`, `src/components/ui/Icon.tsx`
   - Why: noisy and may leak data in production builds.
   - Risk: **low → medium**

8. **Global/window-scoped state & events duplicated**
   - Files: `src/components/Composer.tsx`, `src/hooks/*`
   - Why: coupling via `window.__smui_*` and multiple listeners increases fragility.
   - Risk: **medium**

9. **Missing/fragile cleanup of timers/intervals**
   - Files: `src/components/stage/*`, `src/hooks/usePresenterBridge.ts`
   - Why: potential memory leaks on unmount.
   - Risk: **medium**

10. **Large files not split**
    - Files: `App.tsx`, `Sidebar.tsx`, `Composer.tsx`
    - Why: harder to review and maintain; violates "small incremental PRs" guidance.
    - Risk: **high**

11. **Recomputed large constants inside render**
    - Files: `src/components/Sidebar.tsx` (LANG_OPTIONS)
    - Why: unnecessary allocations each render.
    - Risk: **low**

12. **Leaf components not memoized**
    - Files: `src/components/editor/ChapterBlock.tsx`, `src/components/sidebar/ScriptList.tsx`, `src/components/ui/Icon.tsx`
    - Why: pure components re-render too often.
    - Risk: **medium**

13. **Heavy synchronous work inside speech `onresult` handler**
    - Files: `src/hooks/useAppSpeechControl.ts`
    - Why: CPU bursts can block UI and cause missed frames.
    - Risk: **medium**

14. **Loose messaging types for presenter**
    - Files: `src/hooks/usePresenterBridge.ts`, `src/lib/presenter-transport.ts`
    - Why: message shape brittleness; harder to refactor safely.
    - Risk: **medium**

15. **No E2E / integration coverage for critical flows**
    - Files: n/a
    - Why: pairing/presenter/speech flows untested.
    - Risk: **high**

16. **No CI enforcement for lint/tests**
    - Files: repo root (no `.github/workflows/ci.yml`)
    - Why: regressions can land unnoticed.
    - Risk: **high**

17. **Direct window/document usage without guards**
    - Files: multiple hooks/components
    - Why: prevents easy SSR adoption and is brittle in some envs.
    - Risk: **low**

18. **Inline style/JSX objects re-created each render**
    - Files: assorted (minor hotspots)
    - Why: avoidable GC pressure.
    - Risk: **low**

19. **Undo/redo logic embedded in `App`**
    - Files: `src/App.tsx`
    - Why: should be extracted into `useUndoStack` for testability.
    - Risk: **medium**

20. **No perf profiling documentation or baseline**
    - Files: repo docs
    - Why: hard to measure impact of refactors.
    - Risk: **medium**

---

## 2) PR Plan — 8 incremental PRs (preserve public API & UX)

Note: PRs are intentionally small. Each should include tests or smoke-check steps where feasible.

PR 1 — Lint & Quick Wins (recommended start) ✅
- Goal: reduce noise, add small hoists & ESLint rules.
- Files touched:
  - `package.json` (eslintConfig)
  - `src/hooks/useAppSpeechControl.ts`
  - `src/components/ui/Icon.tsx`
  - `src/components/overlays/ContextMenu.tsx`
  - `src/components/Sidebar.tsx`
- Tasks:
  1. Add `no-console: warn` and `@typescript-eslint/no-explicit-any: warn` to `eslintConfig`.
  2. Remove or guard `console.log` / `console.warn` in runtime code.
  3. Hoist `LANG_OPTIONS` out of `Sidebar` render and memoize.
  4. Replace `key={idx}` in `ContextMenu` with stable keys.
  5. Run `npm run lint -- --fix` and fix auto-fixable issues.
- Acceptance checks:
  - `npm run lint` shows no new warnings from changes.
  - Manual smoke test: editor, add/delete chapters, mic toggle.

PR 2 — Memoize leaf components & stabilize handlers
- Goal: reduce re-renders on editor & lists.
- Files touched:
  - `src/components/editor/ChapterBlock.tsx` (React.memo)
  - `src/components/ScriptArea.tsx` (stabilize handlers)
  - `src/components/sidebar/ScriptList.tsx` (memo)
  - `src/components/ui/Icon.tsx` (cache SVG parsing)
- Tasks:
  1. Wrap pure leaf components in `React.memo`.
  2. Replace inline arrow props inside `.map()` with stable callbacks (useCallback factory or pass ids).
  3. Add unit test verifying ChapterBlock does not re-render when adjacent chapter updates.
- Acceptance checks:
  - Profiler: fewer renders for `ChapterBlock` during typing in other chapters.
  - Tests pass.

PR 3 — Extract undo/redo into `useUndoStack`
- Goal: encapsulate undo logic for testability.
- Files touched:
  - `src/hooks/useUndoStack.ts` (new)
  - `src/App.tsx` (replace inline logic)
  - `src/__tests__/useUndoStack.test.ts` (new)
- Tasks:
  1. Implement `useUndoStack` with coalescing logic and limits.
  2. Replace App refs with the hook (behavior-preserving).
  3. Add unit tests for coalescing and undo/redo semantics.
- Acceptance checks:
  - Undo/redo UX unchanged; unit tests added.

PR 4 — Tighten types for presenter / transport
- Goal: reduce `any` usage and prevent message-shape regressions.
- Files touched:
  - `src/lib/presenter-transport.ts`
  - `src/hooks/usePresenterBridge.ts`
  - `src/hooks/usePresenterSync.ts`
  - `src/lib/presenter.ts`
- Tasks:
  1. Add `PresenterMessage` discriminated union and typed `PresenterSender`.
  2. Replace `any` usages in public APIs with explicit types.
  3. Add light unit tests asserting message dispatch shapes.
- Acceptance checks:
  - `tsc` passes; no runtime behavior change.

PR 5 — Add unit tests + CI
- Goal: introduce test runner and CI to prevent regressions.
- Files touched:
  - `package.json` (scripts + devDeps)
  - `vitest.config.ts` or `jest.config.ts` (new)
  - `src/__tests__/` (add 3 focused tests)
  - `.github/workflows/ci.yml` (new)
- Tasks:
  1. Add `vitest` (recommended) and basic config.
  2. Add unit tests for `useScripts`, `usePresenterBridge` (message routing), `ChapterBlock` render stability.
  3. Add GitHub Action to run `npm run lint` + `npm test` on PR.
- Acceptance checks:
  - CI green on PR; local `npm test` passes.

PR 6 — Composer: isolate canvas loop into `useCanvasCompositor`
- Goal: make canvas + RAF lifecycle testable and safer.
- Files touched:
  - `src/components/Composer.tsx` (refactor)
  - `src/hooks/useCanvasCompositor.ts` (new)
  - `src/__tests__/composer.test.ts` (new)
- Tasks:
  1. Extract RAF/stream/video-element lifecycle into `useCanvasCompositor`.
  2. Ensure all streams/RAF/timers are cleaned on unmount.
  3. Add unit tests for cleanup and a manual CPU profile checklist.
- Acceptance checks:
  - No behavioral change; all resources freed on unmount; CPU profile stable or improved.

PR 7 — Split `Sidebar` & `App` into smaller components/hooks
- Goal: improve maintainability and enable targeted perf work.
- Files touched (example):
  - `src/App.tsx` (smaller)
  - `src/components/sidebar/*` (new small components)
  - `src/hooks/useVoiceConfig.ts` (new)
- Tasks:
  1. Move device-picker, voice-config, and on-device-speech UI into focused components/hooks.
  2. Keep props & UX unchanged; add unit tests for extracted logic.
- Acceptance checks:
  - No UI changes; smaller file sizes; tests added.

PR 8 — Lazy-load heavy pieces and bundle analysis (opt)
- Goal: reduce initial bundle and measure impact.
- Files touched (examples):
  - lazy-load `Composer` or `Presenter` where appropriate
  - `vite.config.ts` (visualizer plugin)
- Tasks:
  1. Add dynamic imports for heavy/non-critical components.
  2. Run bundle analysis and confirm chunk splits.
- Acceptance checks:
  - Main chunk size reduced; UX unaffected.

---

## 3) Guardrails

- Tests to run per PR:
  - Unit: `npm test` (Vitest/Jest) — add focused tests for hooks/components changed.
  - Lint: `npm run lint` (must pass on PR).
  - Build: `npm run build` (verify production output).
- ESLint rules to add (gradual):
  - `no-console: warn` (promote removal of console.*)
  - `@typescript-eslint/no-explicit-any: warn` (incremental typing)
  - `react-hooks/exhaustive-deps: error` (enforce correct hooks deps)
- React Profiler steps:
  1. Record while typing in `ScriptArea` for 10s; compare ChapterBlock renders pre/post PR.
  2. Record while adding/removing layers in Composer; check FPS and main-thread time.
- Rollout strategy:
  - Merge safe PRs first (Lint → memoization → types/tests).
  - Use small, reversible PRs; leave heavy refactors behind feature flags if required.
  - Monitor user-facing flows manually after each merge (presenter, speech, composer).
- Manual smoke checklist for every PR:
  - Editor: add/split/delete chapters, undo/redo, keyboard shortcuts.
  - Presenter: open/close window, goto chapter, play/pause.
  - Speech: mic toggle, voice-follow.
  - Composer: add/remove layers, share/capture stream.

---

## 4) Quick wins today (safe, high‑ROI)

1. **Memoize `ChapterBlock`** (`src/components/editor/ChapterBlock.tsx`) — small change, immediate re-render reduction.
2. **Remove/guard console logs** (`src/hooks/useAppSpeechControl.ts`, `src/components/ui/Icon.tsx`).
3. **Replace `key={idx}`** in `ContextMenu` with stable keys (`src/components/overlays/ContextMenu.tsx`).
4. **Hoist `LANG_OPTIONS`** out of `Sidebar` render (`src/components/Sidebar.tsx`).
5. **Add ESLint `no-console` rule and run `--fix`** (`package.json`).

