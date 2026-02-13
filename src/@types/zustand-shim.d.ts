// Minimal shim so the repo typechecks before `npm install` is run.
// This keeps the code compile-able during refactors; the real package
// provides richer types at runtime once installed.
declare module 'zustand' {
  export function create<T = any>(fn: any): any;
  export type StateCreator<T> = any;
  const _default: any;
  export default _default;
}
