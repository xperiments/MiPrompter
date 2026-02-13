# Product summary — Voice Prompter & Script Manager

## TL;DR 🚀
- **VoicePrompter** — production-ready, privacy-first, voice-controlled teleprompter (PWA) that works fully offline and relies on browser-native speech recognition. Ideal for creators who need hands-free scrolling and a lightweight, private solution.
- **Script Manager (UI)** — a modern React UI for creating/managing scripts, previewing layout and syncing to a presenter window (QR pairing / WebSocket). Currently a polished UI skeleton with presenter-integration hooks and PWA support.

---

## Purpose & target users 🎯
- Content creators, on-camera presenters, podcasters, solo video producers, and live-streamers who need an offline, privacy-preserving teleprompter with voice control and flexible presentation/remote workflows.

---

## One-line positioning
A lightweight, private teleprompter you can run in-browser or as a PWA — voice-controlled, highly customizable, and designed to integrate with a remote script manager for multi-device presentation.

---

## Status (current workspace) ✅ / ⚠️
- `VoicePrompter-main`: feature-complete, user-facing, PWA-ready, actively documented in `VoicePrompter-main/README.md`.
- `script-manager-ui`: production-quality UI + hooks for presenter sync; currently a UI-first implementation (skeleton features for some server-side flows are mocked).

---

## Technical highlights 🔧
- Framework: `Vite + TypeScript` (both projects)
- Styling: `Tailwind CSS`
- Offline/PWA: service worker + manifest (installable on iOS/Android/desktop)
- Voice control: Web Speech API (on-device — no external servers)
- Presenter sync: postMessage / WebSocket + QR pairing (script-manager provides pairing UI)
- Storage: localStorage for script history and preferences

---

## Where to look (key files) 🔎
- Teleprompter app: `VoicePrompter-main/src/*` (ui, speech, state) — main entry: `VoicePrompter-main/index.html`
- Script editor / presenter UI: `src/components/*` (notable: `ScriptArea.tsx`, `Sidebar.tsx`, `ScriptList.tsx`)
- Presenter bridge & sync: `src/lib/presenter.ts`, hooks: `src/hooks/usePresenterSync.ts`, `usePresenterBridge.ts`
- Pairing / offline: `manifest.webmanifest`, `sw.js`, `scripts/mock-ws-server.js`

---

## Product features — VoicePrompter (numbered) 📝
1. Voice-controlled automatic scrolling (Web Speech API) — hands-free reading and auto-scroll while you speak
2. 100% local / privacy-first processing — no external APIs or networked speech services
3. PWA installable (offline-capable) — works like a native app after install
4. Multi-language support & auto-detection — supports 20+ languages and auto-detects script language
5. Mirror mode (horizontal flip + rotate) — teleprompter-glass compatible
6. Screen rotation for locked-orientation devices — 90° rotation shortcut for iOS workflows
7. Fine-grained appearance controls — font size, line & paragraph spacing, side margins
8. Theme & color customization — dark/light + full color pickers for text/background
9. Show punctuation stop markers — visual pacing aids for pauses and sentence ends
10. Click-to-jump + manual navigation controls — tap any word to jump; restart/back controls
11. Script history & local persistence — automatic save and quick reload from browser localStorage
12. Special voice commands (example: “prompter restart”) — command shortcuts while reading
13. Accessibility-minded layout (large fonts, spacing controls) — optimized for distance reading
14. Works offline and on-device — reliable in low-connectivity environments
15. Graceful degradation — manual scrolling when speech API is unavailable

---

## Product features — Script Manager (concise list)
1. Script editing with chapters, drag-and-drop reordering, and split/merge operations
2. UI-first controls for appearance (mirroring, spacing, font size, width)
3. Presenter preview + open teleprompter button and speaker/mic controls
4. QR-based pairing and mock WebSocket server for remote presenter control
5. Hooks for device detection (camera, microphone, screen) and presenter sync
6. Export/import scripts and local persistence

---

## User journeys (example flows) 🧭
1. Solo presenter: open `VoicePrompter`, paste script, tune font/spacing, install PWA, enable voice control, present offline.
2. Remote production: create/edit scripts in `Script Manager`, pair with presenter window via QR (or WebSocket), sync appearance and active script in real time.

---

## Strengths & risks ⚖️
- Strengths: privacy (on-device), offline reliability, polished UX, robust customization, easy install as PWA.
- Risks: voice control depends on browser support (not available in Firefox); iOS speech behavior can be fragmented between WebKit variants.

---

## Recommended short roadmap (next 6–12 weeks) ⏱️
1. Stabilize presenter pairing (persist paired devices + reconnection strategy) — high priority
2. Add E2E test(s) for voice-triggered scrolling and stop-marker behavior — medium priority
3. Analytics toggle + opt-in crashreporting (privacy-first) — low priority
4. Mobile-specific UI polish (iOS PWA insets & buttons) — medium priority
5. Publish `script-manager-ui` sample integration: demo to pair with `VoicePrompter-main` — quick win

---

## Suggested copy for App Store / Listing (short) ✍️
Voice Prompter — Hands-free, private teleprompter that runs entirely in your browser. Voice-controlled scrolling, offline-ready PWA, and deep customization for on-camera professionals.

---

## Quick acceptance criteria for v1.0 ✅
- Voice scrolling works reliably on Chrome & Safari (desktop + mobile)
- PWA install + offline reload works on iOS & Android
- Script history persists and can be reloaded
- Presenter pairing reliably syncs active script + appearance

---

## Quick wins I can implement for you 💡
- Add a one-click demo pairing flow (script-manager → VoicePrompter) and automated reconnection logic
- Add an accessibility audit & quick fixes (ARIA, focus management, contrast)

---

> If you want, I can open a PR that adds a `product.md` badge to both `README.md`, generate release notes for a v1.0, and draft the App Store / PWA listing copy.

---

Last updated: 2026-02-10
