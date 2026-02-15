# Refactor roadmap — MiPrompter

> Concise, incremental plan to improve maintainability, safety and testability while preserving all runtime, timing and lifecycle semantics (especially media/real-time paths).

---

## 1) Architecture summary 🏗️

- App shell (`src/App.tsx`, `src/main.tsx`) — single-page React (Vite). Responsible for: script CRUD, UI state, permission gating, speech control and wiring of presenter APIs.
- Presenter window (`app.html` / `src/presenter.tsx`) — independent window that renders the teleprompter UI, handles tokenization, scrolling, WebRTC/WS pairing and screen/camera display.
- Transport layer (`src/lib/presenter-transport.ts`) — dual-path messaging: `postMessage` (same-origin presenter window) + optional WS signaling (remote presenters / phone). Centralized sender registration via `setPresenterWsSender`.
- Presenter bridge & sync hooks (`src/hooks/usePresenterBridge.ts`, `src/hooks/usePresenterSync.ts`) — lifecycle, message handling, and controller⇄presenter synchronization.
- Media pipeline & compositor (`src/hooks/useCanvasCompositor.ts`, `src/lib/media-devices.ts`, `src/components/stage/*`) — camera/screen capture, canvas compositing, captureStream and optional synthetic streams.
- Persistence (`src/hooks/useScripts.ts`, `src/lib/local-storage.ts`, `src/lib/db.ts`) — currently dual-layer: localStorage (immediate/sync) + async IndexedDB mirror. **Target: migrate entirely to IndexedDB** for all persisted state (scripts, appearance, settings).
- Global state (`src/stores/ui.ts`) — small Zustand store for UI appearance and content type.
- Tests — unit tests (Vitest + testing-library) covering core UI and several hooks; media + presenter runtime tested loosely.

Key constraints:
- Real-time/media logic (capturing, compositing, frame loops, WebRTC) is timing-sensitive — refactors MUST preserve requestAnimationFrame cadence, setInterval behavior, and message formats.
- Cross-window/WS compatibility must be preserved (postMessage shapes + WS signaling).

---

## 2) Major problems (ranked by impact) ⚠️

1. Large, monolithic runtime files (High)
   - `src/presenter.tsx`, `src/App.tsx` are large and mix concerns (UI + signaling + business logic).
   - Impact: hard to reason about presenter lifecycle, tests and future features.
   - First action: extract pure utilities (tokenizer, message handlers) behind well-typed APIs.

2. Implicit global transport + fragile message routing (High)
   - Multiple paths: `postMessage`, WS sender registration, window globals (`__smui_*`) and ad-hoc re-posting.
   - Impact: race conditions, duplicated logic and fragile integration with remote presenters.
   - First action: consolidate a typed transport adapter (behavior-preserving shim for existing APIs).

3. Weak/loose typing & `any` leaks (Medium-High)
   - Tests and a few modules use `any` and loose payload handling; message payloads are parsed without schema checks.
   - Impact: runtime errors and brittle refactors.
   - First action: add/expand TypeScript types for messages and public hook return shapes; add unit tests for message parsing.

4. Inconsistent error handling & noisy console usage (Medium)
   - Many swallowed catches and scattered `console.log` statements in runtime code (some intentionally tolerant for UX, some noisy).
   - Impact: harder debugging and noisy logs in CI/dev.
   - First action: introduce a small `logger` utility (debug gating) and tighten error surfaces while keeping behavior identical.

5. Dual persistence layer (localStorage + IndexedDB) (Medium)
   - `localStorage` + async `idb` mirror logic creates duplication, sync issues and migration complexity across hooks.
   - Impact: wasted writes, fragile sync between storage layers, limited quota for localStorage.
   - First action: **migrate entirely to IndexedDB** — remove localStorage writes, keep only IndexedDB with optimistic in-memory cache for reads.

6. Timing-sensitive loops and polling (Medium)
   - `requestAnimationFrame` loops, `setInterval` checks (presenter window-check), and canvas capture timing are central to UX.
   - Impact: regressions could cause missed frames, stutters or sync bugs.
   - First action: encapsulate loops behind testable schedulers without changing cadence.

7. Test gaps around presenter & media signaling (Medium)
   - Need deterministic unit tests for tokenization, composer output, and transport edge-cases.
   - First action: add focused unit tests before touching logic.

---

## 3) Refactor plan — split into small, safe PRs (preserve behaviour) ✅

Order: start with low-risk, high-value PRs (types, tests, lint), then do incremental extraction/refactors that are backward-compatible. Each PR is designed to be reviewable and revertible.

PR-01 — Add roadmap + working notes (tiny)
- Files: `docs/refactor2.md` (this file)
- Goal: document plan and acceptance criteria.
- Risk: none.
- Tests: N/A.

PR-02 — Strengthen types & expand `PresenterMessage` coverage (small)
- Files: `src/lib/presenter-transport.ts`, `src/types.ts`, add tests `src/__tests__/presenter-transport.test.ts`.
- Changes: replace any/loose parsing with discriminated unions + add unit tests verifying runtime shapes.
- Risk: minimal — no runtime change; compile-time safety.
- Acceptance: all existing behavior unchanged; new unit tests pass.

PR-03 — Add a lightweight `logger` util + replace non-critical console.* (small)
- Files: new `src/lib/logger.ts`, replace `console.log` in non-media/debug places (exclude deeply timing/log calls in `presenter.tsx` until PR-06).
- Changes: logs gated by `DEBUG` flag; CI remains quiet.
- Risk: none (behavior-preserving).

PR-04 — Add unit tests for pure logic (tokenizer, storage, compositor helpers) (small)
- Files: tests for `parseScriptToTokens` (from `src/presenter.tsx`), `lib/local-storage.ts`, `useCanvasCompositor` helpers.
- Changes: add tests to increase confidence prior to refactor.
- Risk: none.

PR-05 — Extract presenter tokenization + scrolling utilities (medium)
- Files: new `src/lib/presenter-tokens.ts`, `src/lib/presenter-scroll.ts` + update `src/presenter.tsx` to import them.
- Changes: move pure logic into small modules and add unit tests.
- Risk: low — behavior identical; thorough tests required.

PR-06 — Consolidate transport adapter (medium)
- Files: `src/lib/presenter-transport.ts` (extend), `src/hooks/usePresenterBridge.ts`, `src/hooks/usePresenterSync.ts`.
- Changes: introduce a typed `PresenterTransport` API that wraps `postMessage` + WS sender registration; add compatibility shim so existing `send()` semantics are unchanged.
- Risk: medium — messaging must stay identical; mitigate with tests and end-to-end checks.

PR-07 — Encapsulate timing-sensitive loops (medium)
- Files: `src/hooks/useCanvasCompositor.ts`, `src/hooks/usePresenterBridge.ts`, `src/presenter.tsx` (move rAF/setInterval into small helpers)
- Changes: extract scheduler helpers that preserve frameMs / interval values and allow deterministic testing.
- Risk: medium — must preserve exact timing semantics. Tests + manual QA required (no behaviour change allowed).

PR-08 — Migrate entirely to IndexedDB (medium)
- Files: `src/lib/storage.ts` (new unified API), `src/hooks/useScripts.ts`, `src/hooks/useLocalStorageState.ts`, `src/stores/ui.ts`.
- Changes: 
  - Create new `storage.ts` API that uses **only IndexedDB** with optimistic in-memory cache for reads.
  - Remove all `localStorage` writes (keep read-only migration path for existing users).
  - Update hooks to use new async/cached API.
  - Add migration: on first load, read localStorage → write to IndexedDB → delete localStorage keys.
- Risk: medium — must ensure writes don't block UI; add tests for migration and cache invalidation.
- Acceptance: all persistence goes through IndexedDB; localStorage used only for one-time migration read.

PR-09 — Componentization & UI cleanup (medium)
- Files: split `src/App.tsx` into `AppShell` + `AppController` + `AppRoutes` where logical; extract large sub-parts from `presenter.tsx` into presentational subcomponents.
- Changes: purely organizational; keep exported hooks/APIs unchanged.
- Risk: low/medium — mitigated by tests and incremental PRs.

PR-10 — Increase test coverage for presenter signaling & media (medium)
- Files: add `src/__tests__/presenter.*`, mocks for WS signaling and message flows.
- Changes: deterministic tests for postMessage + WS fallback + `setPresenterWsSender` behavior.
- Risk: low.

PR-11 — Type tightening sweep + lint fixes (small → medium)
- Files: project-wide small type and lint fixes; enable additional TypeScript/ESLint rules gradually.
- Changes: fix `any` usages, narrow effect dependencies, remove unused vars.
- Risk: small — incremental.

PR-12 — Optional: extract WebRTC/signaling logic into tested module (larger)
- Files: parts of `src/presenter.tsx` related to RTCPeerConnection + datachannels.
- Changes: move complex signaling into `src/lib/webrtc/*` with unit tests; keep runtime unchanged.
- Risk: medium — must preserve timings and ICE flows; add extensive tests and manual checks.

Notes:
- Every PR touching messaging or media must include regression tests that reproduce current behavior (play/pause, word-index sync, presenter init/load).  
- Do not change animation frame rates, setInterval intervals, or message shapes during migration — only encapsulate them.

---

## 4) Risks & migration strategy 🔒

Top risks
- Breaking postMessage/WS message shapes → regression in presenter sync.
- Altering timing (rAF / setInterval) in compositor or presenter → visible stutter or desync.
- Losing backward-compat for remote presenters/phone pairing.

Mitigations
1. Safety-first PRs: add unit tests for every pure function before extraction (tokenizer, storage, transport).  
2. Compatibility shims: when replacing a global (e.g. `_presenterWsSender`) keep a thin shim that preserves runtime behavior for one release.  
3. Preserve timing: any refactor of loops must keep identical frameMs/interval constants and use behavior-preserving wrappers.  
4. Feature-flag / opt-in: large behavioral changes behind a flag and smoke-tested in staging.  
5. Regression matrix: for each PR, run tests + manual smoke (presenter open, play/pause, mic on/off, screen-share, WS pairing).  
6. Add E2E or integration tests for core flows where possible.

Migration checklist (per PR):
- add unit tests for the extracted logic
- add compatibility shim if the public API surface changes
- run vitest + manual smoke on presenter and canvas flows
- keep PR small and revertible

---

## 5) Quick wins (can be merged in minutes → 1 day) ⚡
reate initial `lib/storage.ts` with typed IndexedDB-only API (prep for PR-08
- Replace non-critical `console.log` with `logger.debug()` and gate with DEBUG env (PR-03).  
- Add unit tests for `parseScriptToTokens` (from `src/presenter.tsx`) and for `useCanvasCompositor` drawing helpers (PR-04).  
- Add TypeScript types for a handful of `any` usages in tests (low-risk type cleanup) (PR-02 / PR-11).  
- Add ESLint autofixes and enforce `react-hooks/exhaustive-deps: warn` (small lint PR).  
- Centralize `lsGet/lsSetJSON` usage behind `lib/storage` helpers (small refactor, reduces duplication).

---

## How this aligns with React Best Practices 💡

- Eliminate waterfalls: audit async initialization (keep parallelizable async calls separate) — `useScripts` already uses IDB mirroring asynchronously.  
- Deduplicate global event listeners: `useWindowMessages` and `usePresenterBridge` will be audited and deduped where necessary.  
- Narrow effect dependencies and store transient values in refs: targeted in PR-11.  
- Preserve timing-sensitive logic: all compositor/real-time changes are encapsulated without changing cadence.

---

If you want, I can:
1) open the first small PRs (types + tests + logger), or
2) generate detailed checklists and unit-tests for any specific PR from the plan.

Which task should I start with? (I recommend starting with PR-02: types + tests)