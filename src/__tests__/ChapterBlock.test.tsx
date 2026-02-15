import React, { Profiler } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChapterBlock } from '../components/editor/ChapterBlock';

describe('ChapterBlock (memo)', () => {
  it('updating one chapter does not affect the other DOM node', async () => {
    function Parent() {
      const [a, setA] = React.useState('one');
      const [b, setB] = React.useState('two');
      const noop = React.useCallback(() => {}, []);

      return (
        <>
          <ChapterBlock
            id="a"
            text={a}
            onChange={noop}
            onAddAfter={noop}
            onAddBefore={noop}
            onDelete={noop}
            onSplit={noop}
          />

          <ChapterBlock
            id="b"
            text={b}
            onChange={noop}
            onAddAfter={noop}
            onAddBefore={noop}
            onDelete={noop}
            onSplit={noop}
          />

          <button data-testid="update-b" onClick={() => setB('updated')}>
            Update B
          </button>
        </>
      );
    }

    render(<Parent />);

    const taA = await screen.findByLabelText('Chapter a');
    const taB = await screen.findByLabelText('Chapter b');

    expect(taA).toBeTruthy();
    expect(taB).toBeTruthy();

    expect((taA as HTMLTextAreaElement).value).toBe('one');
    expect((taB as HTMLTextAreaElement).value).toBe('two');

    const btn = screen.getByTestId('update-b');
    fireEvent.click(btn);

    // A's DOM value should remain unchanged
    expect((taA as HTMLTextAreaElement).value).toBe('one');

    // B's DOM value should update
    expect((taB as HTMLTextAreaElement).value).toBe('updated');
  });
});
