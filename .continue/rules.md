# AI Coding Rules — Project Behavior Contract

## General Behavior

* Never invent APIs, hooks, props, or files
* Search the codebase before answering
* Prefer modifying existing code over creating new abstractions
* Follow existing naming and structure patterns
* Keep changes minimal and incremental
* Preserve behavior unless explicitly asked to change it
* If unsure, ask for clarification instead of guessing

## Refactoring

* Maintain exact runtime behavior
* Prefer small PR-style changes
* Do not rewrite large files
* Explain tradeoffs briefly
* Avoid introducing new dependencies

---

## React Rendering

* Do not store derived state in useState
* Derive values during render whenever possible
* Avoid effects that only sync state
* Put user actions inside event handlers, not effects
* Narrow effect dependencies to primitives
* Avoid unnecessary useMemo/useCallback
* Use functional setState updates when depending on previous state
* Use lazy initialization for expensive state
* Use useRef for transient mutable values

---

## Component Structure

* Split expensive UI into memoized child components
* Early-return loading states before heavy computation
* Keep components pure whenever possible
* Prefer composition over prop drilling
* Do not introduce global state unless existing architecture uses it

---

## Data Fetching

* Avoid sequential awaits when independent
* Use Promise.all for parallel work
* Fetch only when needed
* Never fetch inside render loops
* Prefer existing fetching patterns in the repo
* Deduplicate requests when possible

---

## Performance

* Avoid unnecessary re-renders
* Avoid barrel imports if project avoids them
* Lazy-load heavy components
* Do not block UI with non-urgent updates
* Use transitions for non-urgent updates

---

## State Management

* UI state → useState
* Mutable non-UI values → useRef
* Derived values → compute during render
* Async operations → event handlers or existing patterns

---

## Safety

* Do not change public interfaces without warning
* Do not remove error handling
* Do not change types unless necessary
* Keep backward compatibility
