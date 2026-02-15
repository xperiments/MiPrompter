import { describe, it, expect } from 'vitest';
import { parseScriptToTokens } from '../presenter';

describe('parseScriptToTokens', () => {
  it('tokenizes simple words and assigns correct indices', () => {
    const doc = { id: 'd1', chapters: [{ id: 'c1', text: 'Hello world' }] } as any;
    const toks = parseScriptToTokens(doc, false);
    const words = toks.filter((t) => t.isWord && !t.skip);
    expect(words.map((w) => w.clean)).toEqual(['hello', 'world']);
    expect(words[0].index).toBe(0);
    expect(words[1].index).toBe(1);
  });

  it('skips bracketed tokens and emojis (skip=true, index=-1)', () => {
    const doc = {
      id: 'd1',
      chapters: [{ id: 'c1', text: 'Hello [skip me] 😊 world' }],
    } as any;
    const toks = parseScriptToTokens(doc, false);
    const visible = toks.filter((t) => t.isWord && !t.skip).map((t) => t.clean);
    expect(visible).toEqual(['hello', 'world']);

    const skipped = toks.filter((t) => t.isWord && t.skip).map((t) => t.text);
    expect(skipped).toContain('[skip');
    expect(skipped.some((s) => /\p{Emoji}/u.test(s))).toBe(true);

    // indices for skipped tokens must be -1
    expect(toks.find((t) => t.text === '😊')!.index).toBe(-1);
  });

  it('produces stop-sign token for line-break when preserveFormatting=false', () => {
    const doc = { id: 'd1', chapters: [{ id: 'c1', text: 'One\nTwo' }] } as any;
    const toks = parseScriptToTokens(doc, false);
    const stop = toks.find((t) => t.isStop === true);
    expect(stop).toBeTruthy();
    expect(stop!.index).toBe(-1);
  });

  it('produces paragraph-break token when preserveFormatting=true', () => {
    const doc = { id: 'd1', chapters: [{ id: 'c1', text: 'A\nB' }] } as any;
    const toks = parseScriptToTokens(doc, true);
    const pb = toks.find((t) => t.isParagraphBreak === true);
    expect(pb).toBeTruthy();
    expect(pb!.index).toBe(-1);
  });
});
