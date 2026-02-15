import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useScripts } from '../hooks/useScripts';
import { act } from 'react';

describe('useScripts', () => {
  it('adds and removes scripts (persist: false)', async () => {
    let hook: ReturnType<typeof useScripts> | null = null;

    function Harness() {
      const h = useScripts({ persist: false });
      React.useEffect(() => {
        hook = h;
      }, [h]);
      return null;
    }

    render(<Harness />);

    await waitFor(() => expect(hook).not.toBeNull());

    const initial = hook!.docs.length;

    let newId: string | undefined;
    act(() => {
      newId = hook!.addScript('test-script');
    });

    await waitFor(() => expect(hook!.docs[0].id).toBe(newId));
    expect(hook!.docs.length).toBe(initial + 1);

    act(() => {
      hook!.removeScript(hook!.docs[0].id);
    });

    await waitFor(() => expect(hook!.docs.length).toBe(initial));
  });
});
