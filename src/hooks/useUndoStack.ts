import { useRef } from "react";

export type UseUndoStack<T extends { docId?: string } = { docId?: string }> = {
  pushUndo: (e: T) => void;
  pushRedo: (e: T) => void;
  popUndo: () => T | undefined;
  popRedo: () => T | undefined;
  clearRedo: () => void;
  removeUndoEntriesForDoc: (docId: string) => void;
  removeRedoEntriesForDoc: (docId: string) => void;
  getUndoStack: () => T[];
  getRedoStack: () => T[];
};

export function useUndoStack<T extends { docId?: string } = { docId?: string }>(opts?: { maxUndo?: number }): UseUndoStack<T> {
  const maxUndo = opts?.maxUndo ?? 200;
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);

  function pushUndo(e: T) {
    const s = undoRef.current;
    s.push(e);
    if (s.length > maxUndo) s.splice(0, s.length - maxUndo);
  }

  function pushRedo(e: T) {
    const s = redoRef.current;
    s.push(e);
    if (s.length > maxUndo) s.splice(0, s.length - maxUndo);
  }

  function popUndo() {
    return undoRef.current.pop();
  }

  function popRedo() {
    return redoRef.current.pop();
  }

  function clearRedo() {
    redoRef.current.length = 0;
  }

  function removeUndoEntriesForDoc(docId: string) {
    undoRef.current = undoRef.current.filter((x: T) => x?.docId !== docId);
  }

  function removeRedoEntriesForDoc(docId: string) {
    redoRef.current = redoRef.current.filter((x: T) => x?.docId !== docId);
  }

  function getUndoStack() {
    return [...undoRef.current];
  }

  function getRedoStack() {
    return [...redoRef.current];
  }

  return {
    pushUndo,
    pushRedo,
    popUndo,
    popRedo,
    clearRedo,
    removeUndoEntriesForDoc,
    removeRedoEntriesForDoc,
    getUndoStack,
    getRedoStack,
  };
}
