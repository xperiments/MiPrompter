import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as transport from '../lib/presenter-transport';
import { usePresenterBridge } from '../hooks/usePresenterBridge';
import { act } from 'react';

describe('usePresenterBridge', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts messages to presenter window when available', async () => {
    let hook: ReturnType<typeof usePresenterBridge> | null = null;
    function Harness() {
      const h = usePresenterBridge();
      React.useEffect(() => {
        hook = h;
      }, [h]);
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(hook).not.toBeNull());

    const fakeWin = { postMessage: vi.fn(), closed: false } as unknown as Window;
    act(() => {
      hook!.presenterWindowRef.current = fakeWin;
    });

    act(() => {
      const ok = hook!.send({ type: 'play' });
      expect(ok).toBe(true);
    });

    expect(fakeWin.postMessage).toHaveBeenCalledWith({ type: 'play' }, window.location.origin);
  });

  it('falls back to WS sender when no window', async () => {
    let hook: ReturnType<typeof usePresenterBridge> | null = null;
    function Harness() {
      const h = usePresenterBridge();
      React.useEffect(() => {
        hook = h;
      }, [h]);
      return null;
    }

    render(<Harness />);
    await waitFor(() => expect(hook).not.toBeNull());

    const spy = vi.spyOn(transport, 'sendToPresenterViaWs').mockImplementation(() => true);

    act(() => {
      hook!.presenterWindowRef.current = null;
    });

    act(() => {
      hook!.send({ type: 'play' });
    });

    expect(spy).toHaveBeenCalledWith({ type: 'play' });
  });
});
