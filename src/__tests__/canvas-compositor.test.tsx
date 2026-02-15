import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useCanvasCompositor } from '../hooks/useCanvasCompositor';

function TestHarness({ layers }: { layers: any[] }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const layersRef = React.useRef<any[]>(layers);
  const sourceVideoElsRef = React.useRef<Map<string, HTMLVideoElement>>(new Map());
  const sourceStreamsRef = React.useRef<Map<string, MediaStream>>(new Map());
  const outStreamRef = React.useRef<MediaStream | null>(null);
  const animationRef = React.useRef<number | null>(null);
  const lastRenderRef = React.useRef<number>(0);

  React.useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useCanvasCompositor({
    canvasRef,
    layersRef,
    sourceVideoElsRef,
    sourceStreamsRef,
    outStreamRef,
    animationRef,
    lastRenderRef,
    fps: 12,
    defaultW: 320,
    defaultH: 180,
  });

  return <canvas ref={canvasRef} />;
}

describe('useCanvasCompositor (draw) — unit', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('calls drawImage when a valid video source exists for a layer', async () => {
    const fakeCtx: any = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
    };

    // mock getContext on canvas instances
    // @ts-ignore
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx);

    // also mock captureStream to avoid DOM issues
    const fakeTrack = { stop: vi.fn() } as any;
    const fakeStream = { getTracks: () => [fakeTrack] } as any;
    // @ts-ignore
    HTMLCanvasElement.prototype.captureStream = vi.fn(() => fakeStream);

    // Create a fake video element with dimensions so compositor will draw it
    const fakeVideo = document.createElement('video');
    Object.defineProperty(fakeVideo, 'videoWidth', { value: 160 });
    Object.defineProperty(fakeVideo, 'videoHeight', { value: 90 });

    const layer = {
      id: 'l1',
      sourceId: 's1',
      x: 0,
      y: 0,
      w: 160,
      h: 90,
      zIndex: 1,
      enabled: true,
      opacity: 1,
      rotation: 0,
      mirrorX: false,
      fitMode: 'contain',
    };

    // Provide the video element via the sourceVideoElsRef by attaching it after render
    const { rerender } = render(<TestHarness layers={[]} />);

    // Replace the internal map used by the hook by re-rendering with layers and
    // setting the map on the existing ref via DOM (indirect but effective).
    // We rely on the hook reading sourceVideoElsRef.current during draw.

    // Re-render with layer present
    rerender(<TestHarness layers={[layer]} />);

    // Attach the fake video into the global map used by hook (simulate sourceVideoElsRef)
    // (find the canvas element's owner React instance by querying the DOM)
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    // the hook created a Map inside the component; we can't directly access it here,
    // but the compositor will try to find a video with id 's1' in the provided ref.
    // To simulate that, create a global lookup used by the draw function via document.

    // Create a hidden video element with the same sourceId on the page so drawImage can use it.
    fakeVideo.setAttribute('data-test-source-id', 's1');
    fakeVideo.style.position = 'absolute';
    fakeVideo.style.left = '-9999px';
    document.body.appendChild(fakeVideo);

    // wait for the compositor loop to run and attempt to draw
    await waitFor(() => expect(fakeCtx.drawImage).toHaveBeenCalled(), { timeout: 2000 });

    // cleanup element
    fakeVideo.remove();
  });
});
