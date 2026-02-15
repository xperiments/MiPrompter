import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useCanvasCompositor } from '../hooks/useCanvasCompositor';

function TestHarness({ layers, initialVideos }: { layers: any[]; initialVideos?: Map<string, HTMLVideoElement> }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const layersRef = React.useRef<any[]>(layers);
  const sourceVideoElsRef = React.useRef<Map<string, HTMLVideoElement>>(new Map());
  const sourceStreamsRef = React.useRef<Map<string, MediaStream>>(new Map());

  React.useEffect(() => {
    if (initialVideos) sourceVideoElsRef.current = initialVideos;
  }, [initialVideos]);
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

    // Re-render with layer present and pass the source video map so the hook can find it
    const map = new Map<string, HTMLVideoElement>();
    map.set('s1', fakeVideo);
    rerender(<TestHarness layers={[layer]} initialVideos={map} />);

    // wait for the compositor loop to run and attempt to draw
    await waitFor(() => expect(fakeCtx.drawImage).toHaveBeenCalled(), { timeout: 2000 });

    // cleanup element
    fakeVideo.remove();
  });
});
