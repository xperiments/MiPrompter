import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Composer from '../components/Composer';
import { EVT_COMPOSER_STREAM } from '../lib/keys';

beforeEach(() => {
  // Mock canvas 2D context
  const fakeCtx: any = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  };
  // @ts-ignore - override for tests
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx);

  // Mock captureStream
  const fakeTrack = { stop: vi.fn() } as any;
  const fakeStream = { getTracks: () => [fakeTrack] } as any;
  // @ts-ignore
  HTMLCanvasElement.prototype.captureStream = vi.fn(() => fakeStream);

  // Mock ResizeObserver used by useFitRect
  (globalThis as any).ResizeObserver = class {
    cb: Function;
    constructor(cb: Function) {
      this.cb = cb;
    }
    observe() {
      try {
        this.cb([{ contentRect: { width: 300, height: 200 } }]);
      } catch (_) {}
    }
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    delete (window as any).__smui_composerStream;
  } catch (_) {}
});

describe('Composer compositor (useCanvasCompositor)', () => {
  it('captures canvas stream and exposes it via window and event; cleans up on unmount', async () => {
    const onStream = vi.fn();
    window.addEventListener(EVT_COMPOSER_STREAM, onStream as EventListener);

    const { unmount } = render(<Composer />);

    // wait for event / window global
    await waitFor(() => expect((window as any).__smui_composerStream).toBeTruthy());
    expect(onStream).toHaveBeenCalled();

    const stream = (window as any).__smui_composerStream as MediaStream;
    expect(stream.getTracks().length).toBeGreaterThanOrEqual(1);

    // unmount and verify tracks stopped and global cleared
    unmount();

    await waitFor(() => expect((window as any).__smui_composerStream).toBeUndefined());
  });
});
