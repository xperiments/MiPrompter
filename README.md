# Script Manager UI (React)

UI-only clone (skeleton) inspired by the provided capture.

## Run

```bash
npm i
# start dev server — includes full WebSocket signaling + cached room-state (runs on a single port)
npm run dev

# alias (same behavior): starts vite (kept for compatibility)
npm run dev:with-ws
```

Note: the dev server reads the PORT environment variable so the project works in CodeSandbox — `/ws` is served from the same origin/port as the app.

## What you get

- Top chrome with **Camera / Effects / Prompter** tabs
- Left sidebar with collapsible sections: **Display / Content / Appearance**
- Content type segmented control (Display/Text/Chat)
- Script list with **+ / −** buttons and an **Add Script…** modal
- Main editor area with a left rail, chapter blocks, and a bottom transport bar
- Right-click context menu (visual only)

No real functionality (no saving, no real teleprompter, no STT) — it’s purely a UI skeleton.
